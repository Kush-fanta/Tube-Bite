"""
db.py  —  TubeBite data layer
=====================================
MongoDB (via Motor async driver)  →  users, history collections
Cloudinary                        →  clips, thumbs, avatars

Folder layout in Cloudinary:
  tubebite/clips/{userId}/{jobId}/clip_{n}
  tubebite/thumbs/{userId}/{jobId}/thumb_{n}
  tubebite/avatars/{userId}/avatar          ← fixed ID, overwritten on update
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# MongoDB
# ─────────────────────────────────────────────────────────────────────────────

MONGODB_URI = os.getenv("MONGODB_URI", "")

_mongo_client = None
_db           = None


import certifi

def get_db():
    """Return the Motor database handle (lazy init)."""
    global _mongo_client, _db
    if _db is not None:
        return _db
    if not MONGODB_URI:
        raise RuntimeError("MONGODB_URI not set in .env")
    from motor.motor_asyncio import AsyncIOMotorClient  # type: ignore
    
    # Use certifi for correct SSL/TLS CA bundle
    _mongo_client = AsyncIOMotorClient(
        MONGODB_URI, 
        serverSelectionTimeoutMS=20000,
        tlsCAFile=certifi.where()
    )
    _db = _mongo_client["tubebite"]
    return _db


async def ensure_indexes():
    """Create indexes once at startup. Safe to call multiple times (idempotent)."""
    db = get_db()
    # users: unique username index
    await db.users.create_index("username", unique=True, sparse=True)
    await db.users.create_index("email",    unique=True, sparse=True)
    # history: fast per-user queries + TTL-style queries on deletedAt
    await db.history.create_index([("userId", 1), ("createdAt", -1)])
    await db.history.create_index("deletedAt")
    print("[DB] Indexes ensured.")


# ── Users ─────────────────────────────────────────────────────────────────────

async def get_user(uid: str) -> Optional[dict]:
    """Fetch a user document by Firebase UID."""
    db = get_db()
    return await db.users.find_one({"_id": uid}, {"_id": 0, "id": {"$literal": uid}})


async def upsert_user(uid: str, data: dict) -> dict:
    """
    Create or update a user document.
    `data` may contain: email, displayName, username, bio, photoURL, updatedAt.
    Returns the final document.
    """
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    update = {
        "$set": {**data, "updatedAt": now},
        "$setOnInsert": {"_id": uid, "createdAt": now},
    }
    await db.users.update_one({"_id": uid}, update, upsert=True)
    doc = await db.users.find_one({"_id": uid})
    if doc:
        doc["id"] = doc.pop("_id", uid)
    return doc or {"id": uid, **data}


async def is_username_taken(username: str, current_uid: str) -> bool:
    """Returns True if the username is already used by a DIFFERENT user."""
    db = get_db()
    existing = await db.users.find_one(
        {"username": username.strip().lower(), "_id": {"$ne": current_uid}},
        {"_id": 1},
    )
    return existing is not None


# ── History ───────────────────────────────────────────────────────────────────

async def save_history_item(uid: str, item: dict):
    """Insert a new history item. `item["id"]` is used as the document _id."""
    db = get_db()
    doc = {**item, "_id": item["id"], "userId": uid}
    try:
        await db.history.insert_one(doc)
    except Exception as e:
        print(f"[DB] save_history_item failed: {e}")


async def get_user_history(uid: str) -> dict:
    """
    Return {"active": [...], "trash": [...]} for the user.
    Also permanently removes items that have been in trash > 10 days.
    """
    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()

    # Auto-purge expired trash from DB (delete docs where deletedAt < cutoff)
    expired = db.history.find(
        {"userId": uid, "deletedAt": {"$lt": cutoff, "$ne": None}}
    )
    async for item in expired:
        # Fire Cloudinary deletes for each clip
        for clip in item.get("clips", []):
            pub_id = clip.get("cloudinary_public_id", "")
            if pub_id:
                _cloudinary_delete(pub_id, "video")
            thumb_id = clip.get("cloudinary_thumb_id", "")
            if thumb_id:
                _cloudinary_delete(thumb_id, "image")
    await db.history.delete_many({"userId": uid, "deletedAt": {"$lt": cutoff, "$ne": None}})

    # Fetch remaining docs
    cursor = db.history.find({"userId": uid}).sort("createdAt", -1)
    all_items = []
    async for doc in cursor:
        doc["id"] = doc.pop("_id", doc.get("id"))
        doc.pop("userId", None)
        all_items.append(doc)

    active = [h for h in all_items if not h.get("deletedAt")]
    trash  = [h for h in all_items if h.get("deletedAt")]
    return {"active": active, "trash": trash}


async def soft_delete_history(uid: str, item_id: str) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    result = await get_db().history.update_one(
        {"_id": item_id, "userId": uid},
        {"$set": {"deletedAt": now}},
    )
    return result.modified_count > 0


async def restore_history(uid: str, item_id: str) -> bool:
    result = await get_db().history.update_one(
        {"_id": item_id, "userId": uid},
        {"$set": {"deletedAt": None}},
    )
    return result.modified_count > 0


async def permanent_delete_history(uid: str, item_id: str) -> bool:
    db = get_db()
    doc = await db.history.find_one({"_id": item_id, "userId": uid})
    if not doc:
        return False
    # Delete Cloudinary assets
    for clip in doc.get("clips", []):
        pub_id = clip.get("cloudinary_public_id", "")
        if pub_id:
            _cloudinary_delete(pub_id, "video")
        thumb_id = clip.get("cloudinary_thumb_id", "")
        if thumb_id:
            _cloudinary_delete(thumb_id, "image")
    await db.history.delete_one({"_id": item_id, "userId": uid})
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Cloudinary
# ─────────────────────────────────────────────────────────────────────────────

CLOUDINARY_CLOUD  = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_KEY    = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")

_cloudinary_ready = False

def init_cloudinary():
    global _cloudinary_ready
    if not (CLOUDINARY_CLOUD and CLOUDINARY_KEY and CLOUDINARY_SECRET):
        print("[Cloudinary] Credentials not set — running without Cloudinary.")
        return
    try:
        import cloudinary  # type: ignore
        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD,
            api_key=CLOUDINARY_KEY,
            api_secret=CLOUDINARY_SECRET,
            secure=True,
        )
        _cloudinary_ready = True
        print(f"[Cloudinary] Ready (cloud: {CLOUDINARY_CLOUD})")
    except ImportError:
        print("[Cloudinary] Package not installed — pip install cloudinary")


def upload_clip(file_path: str, user_id: str, job_id: str, clip_index: int) -> dict:
    """
    Upload a clip video to  tubebite/clips/{userId}/{jobId}/clip_{n}
    Returns {"url": str, "public_id": str}
    Falls back to empty strings if Cloudinary not ready.
    """
    if not _cloudinary_ready:
        return {"url": "", "public_id": ""}
    import cloudinary.uploader  # type: ignore
    public_id = f"tubebite/clips/{user_id}/{job_id}/clip_{clip_index}"
    result = cloudinary.uploader.upload(
        file_path,
        resource_type="video",
        public_id=public_id,
        overwrite=True,
        folder=None,           # public_id already contains full path
    )
    return {"url": result["secure_url"], "public_id": result["public_id"]}


def upload_thumb(file_path: str, user_id: str, job_id: str, clip_index: int) -> dict:
    """
    Upload a thumbnail to  tubebite/thumbs/{userId}/{jobId}/thumb_{n}
    Returns {"url": str, "public_id": str}
    """
    if not _cloudinary_ready:
        return {"url": "", "public_id": ""}
    import cloudinary.uploader  # type: ignore
    public_id = f"tubebite/thumbs/{user_id}/{job_id}/thumb_{clip_index}"
    result = cloudinary.uploader.upload(
        file_path,
        resource_type="image",
        public_id=public_id,
        overwrite=True,
    )
    return {"url": result["secure_url"], "public_id": result["public_id"]}


def upload_avatar(file_path_or_bytes, user_id: str) -> dict:
    """
    Upload/replace a user avatar to  tubebite/avatars/{userId}/avatar
    Using a fixed public_id means re-uploading replaces the old one automatically.
    Returns {"url": str, "public_id": str}
    """
    if not _cloudinary_ready:
        return {"url": "", "public_id": ""}
    import cloudinary.uploader  # type: ignore
    public_id = f"tubebite/avatars/{user_id}/avatar"
    result = cloudinary.uploader.upload(
        file_path_or_bytes,
        resource_type="image",
        public_id=public_id,
        overwrite=True,
        invalidate=True,         # bust CDN cache immediately
        transformation=[
            {"width": 400, "height": 400, "crop": "fill", "gravity": "face"},
            {"quality": "auto", "fetch_format": "auto"},
        ],
    )
    return {"url": result["secure_url"], "public_id": result["public_id"]}


def _cloudinary_delete(public_id: str, resource_type: str = "video"):
    """Best-effort Cloudinary delete. Never raises."""
    if not _cloudinary_ready or not public_id:
        return
    try:
        import cloudinary.uploader  # type: ignore
        cloudinary.uploader.destroy(public_id, resource_type=resource_type)
        print(f"[Cloudinary] Deleted {resource_type}: {public_id}")
    except Exception as e:
        print(f"[Cloudinary] Delete failed ({public_id}): {e}")


def is_cloudinary_ready() -> bool:
    return _cloudinary_ready
