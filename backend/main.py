"""
Tube Bite – FastAPI Backend
AI-powered viral clip generator.

Pipeline:
  YouTube URL  → yt-dlp download → Whisper transcribe → LLM detect moments → FFmpeg trim → Cloudinary upload
  Twitch URL   → yt-dlp download → Whisper transcribe → LLM detect moments → FFmpeg trim → Cloudinary upload
  Upload       → save to disk    → Whisper transcribe → LLM detect moments → FFmpeg trim → Cloudinary upload

Storage:
  MongoDB (Motor)  →  users collection, history collection
  Cloudinary       →  tubebite/clips/{userId}/{jobId}/clip_{n}
                      tubebite/thumbs/{userId}/{jobId}/thumb_{n}
                      tubebite/avatars/{userId}/avatar

LLM: nvidia/nemotron-3-nano-30b-a3b:free via OpenRouter (openai-python client)
Aspect ratio: letterbox/pillarbox (scale-to-fit with black bars) — never crops the frame.
Trash: soft-delete with 10-day auto-purge from MongoDB + Cloudinary.
"""

import os
import json
import uuid
import asyncio
import tempfile
import shutil
import subprocess
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Import our data layer
import db as DB

# ─────────────────────────────────────────────────────────────────────────────
# Executable resolution  (ffmpeg / ffprobe / yt-dlp)
# ─────────────────────────────────────────────────────────────────────────────

def _find_exe(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found

    candidates: list[str] = []
    if sys.platform == "win32":
        program_files = [
            os.environ.get("ProgramFiles", r"C:\Program Files"),
            os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
            os.environ.get("LOCALAPPDATA", r"C:\Users\Default\AppData\Local"),
        ]
        for base in program_files:
            candidates += [
                os.path.join(base, "ffmpeg", "bin", f"{name}.exe"),
                os.path.join(base, "ffmpeg", f"{name}.exe"),
                os.path.join(base, "ffmpeg-master-latest-win64-gpl", "bin", f"{name}.exe"),
                os.path.join(base, "yt-dlp", f"{name}.exe"),
            ]
        candidates += [
            rf"C:\ffmpeg-master-latest-win64-gpl-shared\{name}.exe",
            rf"C:\ffmpeg-master-latest-win64-gpl\{name}.exe",
            rf"C:\ffmpeg\bin\{name}.exe",
            rf"C:\ffmpeg\{name}.exe",
        ]
        python_scripts = os.path.join(os.path.dirname(sys.executable), "Scripts", f"{name}.exe")
        candidates.append(python_scripts)
        scoop_dir = os.path.join(os.path.expanduser("~"), "scoop", "shims")
        candidates.append(os.path.join(scoop_dir, f"{name}.exe"))
        candidates.append(rf"C:\ProgramData\chocolatey\bin\{name}.exe")
        winget_base = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages")
        if os.path.isdir(winget_base):
            for pkg in os.listdir(winget_base):
                for sub in [f"{name}.exe", os.path.join("bin", f"{name}.exe")]:
                    p = os.path.join(winget_base, pkg, sub)
                    if os.path.isfile(p):
                        return p

    for c in candidates:
        if os.path.isfile(c):
            return c

    raise RuntimeError(
        f"'{name}' not found on PATH or common install locations.\n"
        f"  Install ffmpeg: winget install Gyan.FFmpeg  or  choco install ffmpeg\n"
        f"  Install yt-dlp: pip install yt-dlp  or  winget install yt-dlp.yt-dlp"
    )


try:
    FFMPEG_BIN  = _find_exe("ffmpeg")
    FFPROBE_BIN = _find_exe("ffprobe")
    YTDLP_BIN   = _find_exe("yt-dlp")
    print(f"[OK] ffmpeg  : {FFMPEG_BIN}")
    print(f"[OK] ffprobe : {FFPROBE_BIN}")
    print(f"[OK] yt-dlp  : {YTDLP_BIN}")
except RuntimeError as _exe_err:
    print(f"\n[WARNING] {_exe_err}\n")
    FFMPEG_BIN  = "ffmpeg"
    FFPROBE_BIN = "ffprobe"
    YTDLP_BIN   = "yt-dlp"

# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Tube Bite API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Local output dir — fallback when Cloudinary not ready (also used for temp work)
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)
app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")

# ─────────────────────────────────────────────────────────────────────────────
# Environment / third-party init
# ─────────────────────────────────────────────────────────────────────────────

OPENROUTER_API_KEY  = os.getenv("OPENROUTER_API_KEY", "")
LLM_MODEL           = "nvidia/nemotron-3-nano-30b-a3b:free"
LLM_MODEL_FALLBACK  = "openai/gpt-4o-mini"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
TRASH_RETENTION_DAYS = 10

# Cloudinary — init via db module
DB.init_cloudinary()

# Firebase Admin
try:
    _base_dir  = os.path.dirname(os.path.dirname(__file__))
    _json_path = os.path.join(_base_dir, "tube-bite-firebase-adminsdk-fbsvc-a976d6db82.json")
    _cred = credentials.Certificate(_json_path)
    firebase_admin.initialize_app(_cred)
    print("[Firebase] Admin SDK initialized.")
except Exception as e:
    print(f"[Firebase] Failed to initialize: {e}")


@app.on_event("startup")
async def on_startup():
    """Create MongoDB indexes on startup."""
    try:
        await DB.ensure_indexes()
    except Exception as e:
        print(f"[DB] Could not ensure indexes: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────

class ClipSettings(BaseModel):
    duration: str = "auto"
    aspectRatio: str = "9:16"
    numberOfClips: int = 3
    generateSubtitles: bool = True
    template: str = "minimal"
    detectionMethod: str = "ai"

class GenerateFromURLRequest(BaseModel):
    url: str
    settings: ClipSettings

class UserProfileUpdate(BaseModel):
    displayName: Optional[str] = None
    username: Optional[str] = None
    bio: Optional[str] = None
    photoURL: Optional[str] = None   # DiceBear URL or Cloudinary URL

# ─────────────────────────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────────────────────────

security = HTTPBearer()

async def get_current_user(res: HTTPAuthorizationCredentials = Depends(security)):
    token = res.credentials
    try:
        decoded = firebase_auth.verify_id_token(token)
        return {"uid": decoded["uid"], "email": decoded.get("email", "")}
    except Exception as e:
        print(f"[Auth] Token verification failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

# ─────────────────────────────────────────────────────────────────────────────
# Helpers – video download
# ─────────────────────────────────────────────────────────────────────────────

def _run(cmd: list, timeout: int = 600) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return result


def normalize_youtube_url(url: str) -> str:
    match = re.search(r"(?:v=|youtu\.be/|embed/|shorts/|/v/)([A-Za-z0-9_-]{11})", url)
    if match:
        return f"https://www.youtube.com/watch?v={match.group(1)}"
    return url


def download_video(url: str, output_path: str) -> str:
    cmd = [
        YTDLP_BIN,
        "--no-playlist",
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", output_path,
        url,
    ]
    try:
        _run(cmd)
    except FileNotFoundError:
        raise RuntimeError("yt-dlp not found. Install: pip install yt-dlp")
    if not os.path.exists(output_path):
        candidate = output_path + ".mp4"
        if os.path.exists(candidate):
            return candidate
    return output_path


def get_video_duration(video_path: str) -> float:
    result = subprocess.run(
        [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        capture_output=True, text=True,
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def get_video_dimensions(video_path: str) -> tuple[int, int]:
    result = subprocess.run(
        [FFPROBE_BIN, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", video_path],
        capture_output=True, text=True,
    )
    try:
        parts = result.stdout.strip().split(",")
        return int(parts[0]), int(parts[1])
    except (ValueError, IndexError):
        return 1920, 1080

# ─────────────────────────────────────────────────────────────────────────────
# Helpers – transcription
# ─────────────────────────────────────────────────────────────────────────────

def transcribe_video(video_path: str) -> list[dict]:
    import whisper  # type: ignore
    print(f"[Whisper] Loading model 'small'...")
    model = whisper.load_model("small")
    print(f"[Whisper] Starting transcription for: {video_path}")
    
    # fp16=False is safer for CPU-only environments and prevents some precision warnings
    result = model.transcribe(
        video_path, 
        task="transcribe", 
        word_timestamps=False, 
        verbose=False,
        fp16=False
    )
    
    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": round(seg["start"], 2),
            "end":   round(seg["end"], 2),
            "text":  seg["text"].strip(),
        })
    print(f"[Whisper] Completed transcription. Found {len(segments)} segments.")
    return segments


def get_youtube_transcript(video_url: str) -> list[dict]:
    from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
    video_id_match = re.search(r"(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})", video_url)
    if not video_id_match:
        raise ValueError(f"Cannot extract YouTube video ID from URL: {video_url}")
    video_id = video_id_match.group(1)
    try:
        api = YouTubeTranscriptApi()
        raw_data = None
        for lang_priority in [["en", "hi"], ["hi", "en"]]:
            try:
                fetched = api.fetch(video_id, languages=lang_priority)
                raw_data = fetched.to_raw_data()
                print(f"[YouTube transcript] Got {len(raw_data)} segments (langs tried: {lang_priority})")
                break
            except Exception:
                continue
        if not raw_data:
            tlist = api.list(video_id)
            available_langs = [t.language_code for t in tlist]
            fetched = api.fetch(video_id, languages=available_langs)
            raw_data = fetched.to_raw_data()
        segments = []
        for entry in raw_data:
            start = round(float(entry["start"]), 2)
            duration = float(entry.get("duration", 2.0))
            segments.append({
                "start": start,
                "end":   round(start + duration, 2),
                "text":  str(entry.get("text", "")).strip(),
            })
        return segments
    except Exception as e:
        print(f"YouTube transcript API failed: {e}")
        return []

# ─────────────────────────────────────────────────────────────────────────────
# Helpers – LLM viral moment detection
# ─────────────────────────────────────────────────────────────────────────────

CHUNK_SIZE_CHARS    = 6000
CHUNK_OVERLAP_CHARS = 500


def _build_transcript_text(segments: list[dict]) -> str:
    lines = []
    for seg in segments:
        t = round(seg["start"], 2)
        lines.append(f"[T={t}s] {seg['text']}")
    return "\n".join(lines)


def _chunk_transcript(transcript_text: str) -> list[str]:
    if len(transcript_text) <= CHUNK_SIZE_CHARS:
        return [transcript_text]
    chunks = []
    start = 0
    while start < len(transcript_text):
        end = start + CHUNK_SIZE_CHARS
        chunks.append(transcript_text[start:end])
        start += CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS
    return chunks


def _build_llm_prompt(chunk: str, settings: ClipSettings, chunk_index: int, total_chunks: int, video_duration: float) -> str:
    if settings.duration == "auto":
        duration_hint = (
            "Pick the EXACT start and end so the clip has a complete, self-contained thought. "
            "Minimum 20 seconds, maximum 59 seconds. Never cut off mid-sentence."
        )
    else:
        dur = settings.duration
        duration_hint = (
            f"Each clip MUST be exactly {dur} seconds. "
            f"Set end_time = start_time + {dur}. "
            "Start at a natural sentence boundary."
        )

    aspect_desc = {
        "9:16":  "vertical short-form (YouTube Shorts / TikTok / Instagram Reels)",
        "1:1":   "square (Instagram feed)",
        "4:5":   "portrait (Instagram feed)",
        "16:9":  "landscape (YouTube / Twitter)",
    }.get(settings.aspectRatio, settings.aspectRatio)

    return f"""You are a world-class short-form video producer. You know exactly what makes people stop scrolling and share a clip.

=== YOUR TASK ===
Read the transcript below and find the {settings.numberOfClips} BEST moments to turn into viral short clips.
Transcript chunk: {chunk_index + 1} of {total_chunks}. Total video length: {video_duration:.0f} seconds.
Target format: {aspect_desc}.

=== HOW TO READ THE TRANSCRIPT ===
Each line looks like: [T=X.XXs] spoken text
[T=X.XXs] means the segment starts at exactly X.XX seconds in the video.
Use these T values DIRECTLY as start_time in your JSON — do NOT convert, do NOT guess.
To set end_time: find the T value of the NEXT segment after your clip ends, or add the clip duration to start_time.

=== DURATION RULE ===
{duration_hint}

=== WHAT MAKES A GREAT CLIP (pick in this order of priority) ===
1. Shocking or counterintuitive fact that challenges what viewers believe
2. The emotional peak of a story — the moment of biggest impact
3. A hot take or controversial opinion that will spark comments
4. A secret or insight "nobody talks about"
5. A funny, unexpected, or surprising moment
6. A powerful quotable one-liner
7. A dramatic before/after or transformation moment

=== RULES ===
- The clip MUST start at a sentence boundary — never mid-word or mid-thought
- The clip MUST be self-contained — understandable without watching the full video
- NEVER pick: greetings, intros, outros, "subscribe", transitions, filler words
- Each clip must be from a DIFFERENT part of the video — no overlapping moments
- Do not START or END any clip mid sentence or mid word strictly. 
- You can also give similar time clips if the START or END any clip is mid sentence or mid word. Eg: 45 seconds to 40 seconds or 50 seconds. +- 5 seconds is allowed.
=== TRANSCRIPT ===
{chunk}

=== RESPOND WITH JSON ONLY ===
Return a JSON array. No markdown. No explanation. No text before or after the array.
[
  {{
    "start_time": <float, exact T value from transcript>,
    "end_time": <float, start_time + clip duration>,
    "title": "<5 words max, punchy>",
    "viral_reason": "<one sentence: exactly WHY this moment will be shared>",
    "viral_score": <0.0 to 1.0>,
    "hook": "<the first sentence spoken in this clip>"
  }}
]
If no strong moments exist in this chunk, return: []
"""



def snap_to_segment_boundaries(start: float, end: float, segments: list[dict]) -> tuple[float, float]:
    """
    Adjusts start/end times to align with the nearest Whisper segment boundaries.
    This prevents clips from starting/ending mid-sentence.
    """
    if not segments:
        return start, end

    # Find segment start closest to 'start'
    closest_start_seg = min(segments, key=lambda s: abs(s['start'] - start))
    new_start = closest_start_seg['start']

    # Find segment end closest to 'end'
    # Use candidates that end strictly after our new start
    valid_end_segs = [s for s in segments if s['end'] > new_start]
    
    if not valid_end_segs:
        # Fallback: if no segment ends after start, just keep original duration or clamp
        return new_start, max(new_start + 5.0, end)

    closest_end_seg = min(valid_end_segs, key=lambda s: abs(s['end'] - end))
    new_end = closest_end_seg['end']

    # Sanity check: if snapping made it huge or tiny, maybe revert or clamp?
    # For now, trust Whisper boundaries are better than LLM hallucinated timestamps.
    return new_start, new_end


def detect_viral_moments_with_llm(
    segments: list[dict],
    settings: ClipSettings,
    video_duration: float,
) -> list[dict]:
    import time
    from openai import OpenAI, RateLimitError  # type: ignore

    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=OPENROUTER_API_KEY,
        timeout=60.0,
        max_retries=0,
    )

    transcript_text = _build_transcript_text(segments)
    chunks = _chunk_transcript(transcript_text)
    all_moments: list[dict] = []
    llm_available = True
    active_model = LLM_MODEL

    def _call_llm(model: str, prompt: str) -> list[dict]:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a viral content expert. Respond with a valid JSON array only. No markdown. No explanation."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=8000,
        )
        raw = response.choices[0].message.content.strip()
        if not raw:
            return []
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```\s*$", "", raw, flags=re.MULTILINE)
        arr_match = re.search(r"\[.*\]", raw, re.DOTALL)
        if arr_match:
            raw = arr_match.group(0)
        else:
            return []
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []

    for i, chunk in enumerate(chunks):
        if not llm_available:
            break
        prompt = _build_llm_prompt(chunk, settings, i, len(chunks), video_duration)
        for attempt in range(2):
            try:
                moments = _call_llm(active_model, prompt)
                
                # Snap timestamps to sentence boundaries
                for m in moments:
                    try:
                        s_raw = float(m.get("start_time", 0))
                        e_raw = float(m.get("end_time", 0))
                        s_snap, e_snap = snap_to_segment_boundaries(s_raw, e_raw, segments)
                        m["start_time"] = s_snap
                        m["end_time"]   = e_snap
                    except (ValueError, TypeError):
                        continue

                all_moments.extend(moments)
                print(f"[LLM] Chunk {i}: {len(moments)} moments via {active_model}")
                break
            except RateLimitError:
                if attempt == 0:
                    print(f"[LLM] Chunk {i}: rate-limited, waiting 8s...")
                    time.sleep(8)
                elif active_model != LLM_MODEL_FALLBACK:
                    active_model = LLM_MODEL_FALLBACK
                    try:
                        moments = _call_llm(active_model, prompt)
                        all_moments.extend(moments)
                    except Exception as fe:
                        print(f"[LLM] Fallback also failed: {fe}")
                        llm_available = False
                    break
                else:
                    llm_available = False
                    break
            except Exception as e:
                err = str(e)
                if "404" in err and active_model != LLM_MODEL_FALLBACK:
                    active_model = LLM_MODEL_FALLBACK
                    try:
                        moments = _call_llm(active_model, prompt)
                        all_moments.extend(moments)
                    except Exception as fe:
                        print(f"[LLM] Fallback failed: {fe}")
                    break
                print(f"[LLM] Chunk {i} failed: {type(e).__name__}: {err[:200]}")
                break

    if not all_moments:
        return _fallback_moments(video_duration, settings)

    all_moments.sort(key=lambda m: m.get("viral_score", 0), reverse=True)
    selected: list[dict] = []
    for moment in all_moments:
        try:
            start = float(moment["start_time"])
            end   = float(moment["end_time"])
        except (KeyError, ValueError, TypeError):
            continue
        if start < 0 or end <= start or start >= video_duration:
            continue
        end = min(end, video_duration)
        if settings.duration != "auto":
            try:
                dur = float(settings.duration)
                end = min(start + dur, video_duration)
            except (ValueError, TypeError):
                pass
        clip_dur = end - start
        if settings.duration == "auto":
            if clip_dur < 10:
                end = min(start + 15, video_duration)
            elif clip_dur > 60:
                end = start + 60
        overlap = any(
            not (end + 3 <= s["start_time"] or start >= s["end_time"] + 3)
            for s in selected
        )
        if not overlap:
            moment["start_time"] = round(start, 2)
            moment["end_time"]   = round(end, 2)
            selected.append(moment)
        if len(selected) >= settings.numberOfClips:
            break

    if len(selected) < settings.numberOfClips:
        selected.extend(
            _fallback_moments(video_duration, settings, exclude=selected)[
                : settings.numberOfClips - len(selected)
            ]
        )

    selected.sort(key=lambda m: m["start_time"])
    return selected[: settings.numberOfClips]


def _fallback_moments(video_duration: float, settings: ClipSettings, exclude: list[dict] | None = None) -> list[dict]:
    try:
        clip_dur = float(settings.duration) if settings.duration != "auto" else 30.0
    except (ValueError, TypeError):
        clip_dur = 30.0
    n = settings.numberOfClips
    exclude = exclude or []
    moments = []
    used_starts = [m["start_time"] for m in exclude]
    max_start = max(0.0, video_duration - clip_dur)
    step = max_start / max(n, 1)
    for i in range(n * 3):
        start = round(min(i * step / 3, max_start), 2)
        end   = round(min(start + clip_dur, video_duration), 2)
        if any(abs(start - u) < clip_dur for u in used_starts):
            continue
        moments.append({
            "start_time":  start,
            "end_time":    end,
            "title":       f"Highlight {len(moments) + 1}",
            "viral_reason":"Selected as a highlight moment.",
            "viral_score": 0.5,
            "hook":        "",
        })
        used_starts.append(start)
        if len(moments) >= n:
            break
    return moments

# ─────────────────────────────────────────────────────────────────────────────
# Helpers – FFmpeg clip extraction + aspect ratio (letterbox, no crop)
# ─────────────────────────────────────────────────────────────────────────────

ASPECT_CANVAS: dict[str, tuple[int, int]] = {
    "9:16":  (1080, 1920),
    "1:1":   (1080, 1080),
    "4:5":   (1080, 1350),
    "16:9":  (1920, 1080),
}


def _build_aspect_filter(src_w: int, src_h: int, aspect_ratio: str) -> str:
    canvas_w, canvas_h = ASPECT_CANVAS.get(aspect_ratio, (1920, 1080))
    return (
        f"scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=decrease,"
        f"pad={canvas_w}:{canvas_h}:(ow-iw)/2:(oh-ih)/2:black"
    )


def _safe_subtitle_path(path: str) -> str:
    p = path.replace("\\", "/")
    if len(p) >= 2 and p[1] == ":":
        p = p[0] + "\\:" + p[2:]
    return p


def extract_and_process_clip(
    video_path: str,
    start: float,
    end: float,
    aspect_ratio: str,
    output_path: str,
    subtitle_path: Optional[str] = None,
) -> str:
    src_w, src_h = get_video_dimensions(video_path)
    aspect_filter = _build_aspect_filter(src_w, src_h, aspect_ratio)

    if subtitle_path and os.path.exists(subtitle_path):
        safe_sub = _safe_subtitle_path(subtitle_path)
        if subtitle_path.endswith(".ass"):
            vf = f"{aspect_filter},ass='{safe_sub}'"
        else:
            vf = (
                f"{aspect_filter},"
                f"subtitles='{safe_sub}':"
                f"force_style='FontSize=80,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=4,Alignment=2,Bold=1'"
            )
    else:
        vf = aspect_filter

    cmd = [
        FFMPEG_BIN, "-y",
        "-ss", str(start), "-to", str(end),
        "-i", video_path,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path,
    ]
    try:
        _run(cmd)
    except FileNotFoundError:
        raise RuntimeError("ffmpeg not found. Install: winget install Gyan.FFmpeg")
    except RuntimeError as e:
        err_str = str(e)
        if subtitle_path and ("subtitles" in err_str.lower() or "ass" in err_str.lower()):
            print(f"[WARN] Subtitle burn failed, retrying without subtitles: {err_str[:200]}")
            cmd_no_sub = [
                FFMPEG_BIN, "-y",
                "-ss", str(start), "-to", str(end),
                "-i", video_path,
                "-vf", aspect_filter,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                output_path,
            ]
            _run(cmd_no_sub)
        else:
            raise
    return output_path


def generate_subtitles_for_clip(
    video_path: str,
    start: float,
    end: float,
    segments: list[dict],
    srt_path: str,
    aspect_ratio: str = "9:16",
) -> str:
    ass_path = re.sub(r'\.srt$', '.ass', srt_path)
    if ass_path == srt_path:
        ass_path = srt_path + ".ass"

    canvas = ASPECT_CANVAS.get(aspect_ratio, (1080, 1920))
    play_res_x, play_res_y = canvas
    font_size = max(60, int(min(play_res_x, play_res_y) * 0.07))
    margin_v  = int(play_res_y * 0.22)
    WORDS_PER_GROUP = 3

    def fmt_ts(sec: float) -> str:
        sec = max(0.0, sec)
        h  = int(sec // 3600)
        m  = int((sec % 3600) // 60)
        s  = int(sec % 60)
        cs = int(round((sec % 1) * 100))
        if cs >= 100:
            cs = 99
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    clip_segs = [s for s in segments if s["end"] > start and s["start"] < end]
    words: list[dict] = []
    for seg in clip_segs:
        text = str(seg.get("text", "")).strip()
        ws = text.split()
        if not ws:
            continue
        s0 = max(seg["start"], start)
        s1 = min(seg["end"],   end)
        if s1 <= s0:
            continue
        dpw = (s1 - s0) / len(ws)
        for j, w in enumerate(ws):
            words.append({"word": w, "t0": s0 + j * dpw, "t1": s0 + (j + 1) * dpw})

    if not words:
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write("[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
        return ass_path

    words.sort(key=lambda x: x["t0"])
    for i in range(len(words) - 1):
        if words[i]["t1"] > words[i+1]["t0"]:
            words[i]["t1"] = words[i+1]["t0"]

    events: list[str] = []
    for g0 in range(0, len(words), WORDS_PER_GROUP):
        group = words[g0 : g0 + WORDS_PER_GROUP]
        for ai, aw in enumerate(group):
            ev_s = max(0.0, aw["t0"] - start)
            ev_e = min(end - start, aw["t1"] - start)
            if ev_e <= ev_s:
                continue
            parts = []
            for wi, we in enumerate(group):
                w = we["word"]
                if wi == ai:
                    parts.append(f"{{\\rHi}}{w}{{\\r}}")
                else:
                    parts.append(w)
            text = " ".join(parts)
            events.append(
                f"Dialogue: 0,{fmt_ts(ev_s)},{fmt_ts(ev_e)},"
                f"Normal,,0,0,0,,{text}"
            )

    header = f"""\
[Script Info]
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Normal,Arial,{font_size},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,3,0,2,60,60,{margin_v},1
Style: Hi,Arial,{font_size},&H0000FFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,3,0,2,60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write("\n".join(events))
        f.write("\n")

    return ass_path


def capture_thumbnail(video_path: str, seek: float, output_path: str, aspect_ratio: str) -> str:
    src_w, src_h = get_video_dimensions(video_path)
    aspect_filter = _build_aspect_filter(src_w, src_h, aspect_ratio)
    cmd = [
        FFMPEG_BIN, "-y",
        "-ss", str(seek), "-i", video_path,
        "-vframes", "1",
        "-vf", aspect_filter,
        "-q:v", "3",
        output_path,
    ]
    try:
        _run(cmd, timeout=30)
    except Exception:
        pass
    return output_path

# ─────────────────────────────────────────────────────────────────────────────
# Core pipeline
# ─────────────────────────────────────────────────────────────────────────────

async def run_ai_pipeline(
    video_path: str,
    settings: ClipSettings,
    source_type: str,
    source_name: str,
    user_uid: str,
    pre_fetched_segments: Optional[list[dict]] = None,
) -> dict:
    job_id    = f"job_{uuid.uuid4().hex[:16]}"
    work_dir  = tempfile.mkdtemp(prefix="tubebite_")
    job_out_dir = os.path.join(OUTPUT_DIR, job_id)
    os.makedirs(job_out_dir, exist_ok=True)

    try:
        # ── Step 1: Transcription ──────────────────────────────────────────
        if pre_fetched_segments is not None:
            segments = pre_fetched_segments
            print(f"[Pipeline] Using pre-fetched transcript ({len(segments)} segments)")
        else:
            print("[Pipeline] Running Whisper transcription...")
            segments = await asyncio.get_event_loop().run_in_executor(
                None, transcribe_video, video_path
            )
            print(f"[Pipeline] Whisper done: {len(segments)} segments")

        video_duration = get_video_duration(video_path)
        print(f"[Pipeline] Video duration: {video_duration:.1f}s")

        # ── Step 2: LLM viral moment detection ────────────────────────────
        print("[Pipeline] Sending transcript to LLM...")
        moments = await asyncio.get_event_loop().run_in_executor(
            None, detect_viral_moments_with_llm, segments, settings, video_duration
        )
        print(f"[Pipeline] LLM returned {len(moments)} moments")

        # ── Step 3: Extract, transform, upload each clip ──────────────────
        clips = []
        for i, moment in enumerate(moments):
            start    = moment["start_time"]
            end      = moment["end_time"]
            clip_dur = end - start

            clip_id    = f"clip_{uuid.uuid4().hex[:8]}"
            final_path = os.path.join(job_out_dir, f"{clip_id}.mp4")
            thumb_path = os.path.join(job_out_dir, f"{clip_id}_thumb.jpg")
            srt_path   = os.path.join(work_dir,    f"{clip_id}.srt")

            print(f"[Pipeline] Clip {i+1}/{len(moments)}: {start:.1f}s – {end:.1f}s")

            # Subtitles
            subtitle_file = None
            if settings.generateSubtitles and segments:
                subtitle_file = generate_subtitles_for_clip(
                    video_path, start, end, segments, srt_path,
                    aspect_ratio=settings.aspectRatio,
                )

            # Extract + letterbox + subtitle burn
            await asyncio.get_event_loop().run_in_executor(
                None, extract_and_process_clip,
                video_path, start, end, settings.aspectRatio, final_path, subtitle_file,
            )

            # Thumbnail
            thumb_seek = start + clip_dur / 2
            await asyncio.get_event_loop().run_in_executor(
                None, capture_thumbnail,
                video_path, thumb_seek, thumb_path, settings.aspectRatio,
            )

            # ── Upload to Cloudinary ────────────────────────────────────
            # Folder: tubebite/clips/{userId}/{jobId}/clip_{i}
            #         tubebite/thumbs/{userId}/{jobId}/thumb_{i}
            cloudinary_public_id = ""
            cloudinary_thumb_id  = ""
            video_url  = f"{BACKEND_BASE_URL}/output/{job_id}/{clip_id}.mp4"
            thumb_url  = f"{BACKEND_BASE_URL}/output/{job_id}/{clip_id}_thumb.jpg" if os.path.exists(thumb_path) else ""

            if DB.is_cloudinary_ready():
                clip_result = await asyncio.get_event_loop().run_in_executor(
                    None, DB.upload_clip, final_path, user_uid, job_id, i
                )
                if clip_result["url"]:
                    video_url  = clip_result["url"]
                    cloudinary_public_id = clip_result["public_id"]

                if os.path.exists(thumb_path):
                    thumb_result = await asyncio.get_event_loop().run_in_executor(
                        None, DB.upload_thumb, thumb_path, user_uid, job_id, i
                    )
                    if thumb_result["url"]:
                        thumb_url = thumb_result["url"]
                        cloudinary_thumb_id = thumb_result["public_id"]

            # Duration string  m:ss
            total_s = int(clip_dur)
            dur_str = f"{total_s // 60}:{total_s % 60:02d}"

            clips.append({
                "id":                   clip_id,
                "title":                moment.get("title", f"Clip {i + 1}"),
                "thumbnail":            thumb_url,
                "video_url":            video_url,
                "downloadUrl":          video_url,
                "duration":             dur_str,
                "aspectRatio":          settings.aspectRatio,
                "template":             settings.template,
                "hasSubtitles":         settings.generateSubtitles,
                "detectionMethod":      "ai",
                "viralReason":          moment.get("viral_reason", ""),
                "viralScore":           moment.get("viral_score", 0.5),
                "hook":                 moment.get("hook", ""),
                "startTime":            start,
                "endTime":              end,
                "cloudinary_public_id": cloudinary_public_id,
                "cloudinary_thumb_id":  cloudinary_thumb_id,
                "createdAt":            datetime.now(timezone.utc).isoformat(),
            })

        print(f"[Pipeline] Done. {len(clips)} clips ready.")

        # ── Step 4: Save to MongoDB ────────────────────────────────────────
        history_item = {
            "id":              job_id,
            "sourceType":      source_type,
            "sourceName":      source_name,
            "sourceThumbnail": clips[0]["thumbnail"] if clips else "",
            "clips":           clips,
            "settings":        settings.model_dump(),
            "createdAt":       datetime.now(timezone.utc).isoformat(),
            "status":          "completed",
            "deletedAt":       None,
        }
        await DB.save_history_item(user_uid, history_item)

        return {"status": "completed", "job_id": job_id, "clips": clips}

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

# ─────────────────────────────────────────────────────────────────────────────
# API Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "Tube Bite API v3", "status": "running"}


@app.get("/api/health")
async def health():
    def check(name: str, resolved: str) -> dict:
        ok = os.path.isfile(resolved) if resolved != name else shutil.which(name) is not None
        return {"name": name, "path": resolved, "ok": ok}
    return {
        "status":           "ok",
        "executables":      [check("ffmpeg", FFMPEG_BIN), check("ffprobe", FFPROBE_BIN), check("yt-dlp", YTDLP_BIN)],
        "openrouter_key":   bool(OPENROUTER_API_KEY),
        "cloudinary_ready": DB.is_cloudinary_ready(),
        "mongodb_uri_set":  bool(os.getenv("MONGODB_URI")),
    }


# ── User profile ─────────────────────────────────────────────────────────────

@app.get("/api/user/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    """Fetch the logged-in user's profile from MongoDB."""
    try:
        doc = await DB.get_db().users.find_one({"_id": user["uid"]})
        if doc:
            doc["id"] = doc.pop("_id", user["uid"])
            return doc
        # First time — return minimal profile
        return {"id": user["uid"], "email": user["email"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/user/profile")
async def update_profile(
    payload: UserProfileUpdate,
    user: dict = Depends(get_current_user),
):
    """Update editable profile fields. Username must be unique."""
    uid = user["uid"]

    # Validate username uniqueness
    if payload.username:
        username_clean = payload.username.strip().lower()
        if await DB.is_username_taken(username_clean, uid):
            raise HTTPException(status_code=409, detail="Username already taken")

    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "username" in data:
        data["username"] = data["username"].strip().lower()

    try:
        doc = await DB.upsert_user(uid, {**data, "email": user["email"]})
        return doc
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class UsernameCheckRequest(BaseModel):
    username: str

@app.post("/api/user/check-username")
async def check_username(
    payload: UsernameCheckRequest,
    user: dict = Depends(get_current_user),
):
    """Returns 200 if username is available, 409 if taken."""
    username = payload.username.strip().lower()
    if await DB.is_username_taken(username, user["uid"]):
        raise HTTPException(status_code=409, detail="Username already taken")
    return {"available": True, "username": username}


@app.post("/api/user/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Upload a profile picture to Cloudinary at:
      tubebite/avatars/{userId}/avatar
    Returns the Cloudinary secure URL which the client then saves via PUT /api/user/profile.
    """
    if not DB.is_cloudinary_ready():
        raise HTTPException(status_code=503, detail="Cloudinary not configured")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    if len(content) > 3 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 3 MB")

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, DB.upload_avatar, content, user["uid"]
        )
        return {"url": result["url"], "public_id": result["public_id"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Generate clips ────────────────────────────────────────────────────────────

@app.post("/api/clips/generate-from-youtube")
async def generate_from_youtube(
    request: GenerateFromURLRequest,
    user: dict = Depends(get_current_user),
):
    canonical_url = normalize_youtube_url(request.url)
    print(f"[YouTube] {request.url}  →  {canonical_url}")

    work_dir = tempfile.mkdtemp(prefix="tubebite_yt_")
    try:
        video_path = os.path.join(work_dir, "video.mp4")

        segments: list[dict] = []
        try:
            segments = await asyncio.get_event_loop().run_in_executor(
                None, get_youtube_transcript, canonical_url
            )
            print(f"[YouTube] Got {len(segments)} transcript segments")
        except Exception as e:
            print(f"[YouTube] Transcript API failed, will use Whisper: {e}")

        try:
            actual_path = await asyncio.get_event_loop().run_in_executor(
                None, download_video, canonical_url, video_path
            )
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))

        if not segments:
            segments = await asyncio.get_event_loop().run_in_executor(
                None, transcribe_video, actual_path
            )

        result = await run_ai_pipeline(
            video_path=actual_path,
            settings=request.settings,
            source_type="youtube",
            source_name=canonical_url,
            user_uid=user["uid"],
            pre_fetched_segments=segments,
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/api/clips/generate-from-url")
async def generate_from_url(
    request: GenerateFromURLRequest,
    user: dict = Depends(get_current_user),
):
    work_dir = tempfile.mkdtemp(prefix="tubebite_twitch_")
    try:
        video_path = os.path.join(work_dir, "video.mp4")
        try:
            actual_path = await asyncio.get_event_loop().run_in_executor(
                None, download_video, request.url, video_path
            )
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))

        result = await run_ai_pipeline(
            video_path=actual_path,
            settings=request.settings,
            source_type="twitch",
            source_name=request.url,
            user_uid=user["uid"],
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/api/clips/generate-from-upload")
async def generate_from_upload(
    file: UploadFile = File(...),
    settings: str = Form(...),
    user: dict = Depends(get_current_user),
):
    settings_dict = json.loads(settings)
    clip_settings = ClipSettings(**settings_dict)

    work_dir = tempfile.mkdtemp(prefix="tubebite_upload_")
    try:
        safe_name  = re.sub(r"[^\w.\-]", "_", file.filename or "upload.mp4")
        video_path = os.path.join(work_dir, safe_name)
        with open(video_path, "wb") as f_out:
            content = await file.read()
            f_out.write(content)

        result = await run_ai_pipeline(
            video_path=video_path,
            settings=clip_settings,
            source_type="upload",
            source_name=file.filename or "Uploaded video",
            user_uid=user["uid"],
        )
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


# ── History (MongoDB) ─────────────────────────────────────────────────────────

@app.get("/api/clips/history")
async def get_history(user: dict = Depends(get_current_user)):
    try:
        return await DB.get_user_history(user["uid"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/clips/history/{item_id}")
async def soft_delete_history_item(item_id: str, user: dict = Depends(get_current_user)):
    ok = await DB.soft_delete_history(user["uid"], item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="History item not found")
    now = datetime.now(timezone.utc)
    return {
        "status":               "trashed",
        "deletedAt":            now.isoformat(),
        "permanentDeleteAfter": (now + timedelta(days=TRASH_RETENTION_DAYS)).isoformat(),
    }


@app.post("/api/clips/history/{item_id}/restore")
async def restore_history_item(item_id: str, user: dict = Depends(get_current_user)):
    ok = await DB.restore_history(user["uid"], item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"status": "restored"}


@app.delete("/api/clips/history/{item_id}/permanent")
async def permanent_delete_history_item(item_id: str, user: dict = Depends(get_current_user)):
    ok = await DB.permanent_delete_history(user["uid"], item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"status": "permanently_deleted"}


@app.delete("/api/clips/{clip_id}")
async def delete_clip(clip_id: str, user: dict = Depends(get_current_user)):
    DB._cloudinary_delete(f"tubebite/clips/{user['uid']}/{clip_id}", "video")
    return {"deleted": True}


# ── Misc ──────────────────────────────────────────────────────────────────────

@app.get("/api/templates")
async def get_templates():
    return [
        {"id": "minimal",   "name": "Minimal",    "category": "Clean",   "description": "Clean, no-frills look"},
        {"id": "gaming",    "name": "Gaming",      "category": "Gaming",  "description": "Neon overlays, chat highlights"},
        {"id": "podcast",   "name": "Podcast",     "category": "Talk",    "description": "Waveform visuals, speaker names"},
        {"id": "cinematic", "name": "Cinematic",   "category": "Premium", "description": "Letterbox bars, film grain"},
        {"id": "social",    "name": "Social Pop",  "category": "Viral",   "description": "Bold text, emojis, animations"},
        {"id": "news",      "name": "News Flash",  "category": "Info",    "description": "Lower thirds, ticker style"},
    ]


@app.get("/api/clips/status/{job_id}")
async def get_job_status(job_id: str):
    return {"job_id": job_id, "status": "completed", "progress": 100}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
