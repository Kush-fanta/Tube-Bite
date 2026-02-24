import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Camera, Check, X, AlertCircle, Loader2, User, AtSign, FileText, Upload,
} from 'lucide-react';

// ─── Pre-generated DiceBear avatar grid ──────────────────────────────────────
const DICEBEAR_STYLES = [
  'adventurer', 'bottts', 'fun-emoji', 'lorelei', 'personas',
  'avataaars', 'pixel-art', 'notionists', 'micah', 'croodles'
] as const;
const SEEDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa'
];

function dicebearUrl(style: string, seed: string) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

const PRESET_AVATARS = DICEBEAR_STYLES.flatMap(style =>
  SEEDS.map(seed => ({ url: dicebearUrl(style, seed), label: `${style}-${seed}` }))
);

const ITEMS_PER_PAGE = 24;

// ─── Username validation ──────────────────────────────────────────────────────
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function validateUsername(value: string): string | null {
  if (!value.trim()) return 'Username is required.';
  if (!USERNAME_RE.test(value))
    return 'Only letters, numbers, underscores. 3–20 characters.';
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Profile() {
  const { user, updateProfile, checkUsername, getIdToken } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dark = theme === 'dark';

  // ── Form state ──────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');

  // selected avatar: a preset DiceBear URL or a Cloudinary URL after upload
  const [selectedAvatar, setSelectedAvatar] = useState(user?.photoURL ?? '');

  // ── UI state ────────────────────────────────────────────────────────────
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameOk, setUsernameOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarTab, setAvatarTab] = useState<'grid' | 'upload'>('grid');
  const [currentAvatarPage, setCurrentAvatarPage] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect away if not logged in
  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  // ── Username live validation (debounced, checks backend) ─────────────────
  useEffect(() => {
    const err = validateUsername(username);
    if (err) {
      setUsernameError(err);
      setUsernameOk(false);
      return;
    }
    // Debounce the server check
    setUsernameChecking(true);
    setUsernameError(null);
    setUsernameOk(false);
    const timer = setTimeout(async () => {
      const available = await checkUsername(username);
      setUsernameChecking(false);
      if (!available) {
        setUsernameError('This username is already taken.');
        setUsernameOk(false);
      } else {
        setUsernameError(null);
        setUsernameOk(true);
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // ── Handle file upload → Cloudinary via backend ──────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setUploadError('Image must be under 3 MB.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('file', file);

      // Use the same backend URL as AuthContext
      const API_BASE = 'http://localhost:8000';
      const res = await fetch(`${API_BASE}/api/user/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Upload failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (!data.url) throw new Error('Backend did not return an image URL');

      console.log('[Profile] Avatar uploaded:', data.url);
      setSelectedAvatar(data.url);
      setAvatarTab('upload');
    } catch (err: unknown) {
      console.error('[Profile] Avatar upload failed:', err);
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  }, [getIdToken]);

  // ── Select a preset avatar ───────────────────────────────────────────────
  const handleSelectPreset = (url: string) => {
    setSelectedAvatar(url);
    setUploadError(null);
  };

  // ── Save → MongoDB via backend ────────────────────────────────────────────
  const handleSave = async () => {
    const err = validateUsername(username);
    if (err) { setUsernameError(err); return; }
    if (usernameChecking) return; // wait for check to complete
    if (usernameError) return;
    if (!displayName.trim()) return;

    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        photoURL: selectedAvatar || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      // updateProfile only re-throws on a username conflict (409)
      setUsernameError('This username is already taken.');
      setUsernameOk(false);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  // ── Helpers ─────────────────────────────────────────────────────────────
  const inputCls = `w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 ${dark
    ? 'border-white/10 bg-white/5 text-white placeholder-gray-500 focus:border-violet-500/50 focus:ring-violet-500/20'
    : 'border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:ring-violet-400/20'
    }`;

  const labelCls = `mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'
    }`;

  const cardCls = `rounded-2xl border p-6 ${dark ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white shadow-sm'
    }`;

  return (
    <div className={`min-h-screen pt-8 pb-20 ${dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="mx-auto max-w-2xl px-4">

        {/* ── Header ── */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Edit Profile</h1>
          <p className={`mt-1 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            Customise how you appear on TubeBite
          </p>
        </div>

        {/* ── Avatar card ── */}
        <div className={`${cardCls} mb-5`}>
          <h2 className="mb-4 text-sm font-semibold">Profile Picture</h2>

          {/* Current avatar preview */}
          <div className="mb-5 flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0">
              {selectedAvatar ? (
                <img
                  src={selectedAvatar}
                  alt="avatar"
                  className="h-20 w-20 rounded-full object-cover ring-4 ring-violet-500/30"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl font-bold text-white ring-4 ring-violet-500/30">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{displayName || user.displayName}</p>
              <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                {username ? `@${username}` : user.email}
              </p>
              {selectedAvatar && (
                <button
                  onClick={() => { setSelectedAvatar(''); }}
                  className={`mt-2 text-xs ${dark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'} transition-colors`}
                >
                  Remove avatar
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className={`mb-4 flex rounded-xl p-1 text-sm ${dark ? 'bg-white/5' : 'bg-gray-100'}`}>
            {(['grid', 'upload'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setAvatarTab(tab)}
                className={`flex-1 rounded-lg py-2 font-medium capitalize transition-all ${avatarTab === tab
                  ? dark
                    ? 'bg-white/10 text-white'
                    : 'bg-white text-gray-900 shadow-sm'
                  : dark ? 'text-gray-500' : 'text-gray-500'
                  }`}
              >
                {tab === 'grid' ? 'Choose Avatar' : 'Upload Photo'}
              </button>
            ))}
          </div>

          {/* Grid tab */}
          {avatarTab === 'grid' && (
            <div className="space-y-4">
              <div className="grid grid-cols-8 gap-2">
                {PRESET_AVATARS.slice(
                  currentAvatarPage * ITEMS_PER_PAGE,
                  (currentAvatarPage + 1) * ITEMS_PER_PAGE
                ).map(({ url, label }) => (
                  <button
                    key={label}
                    onClick={() => handleSelectPreset(url)}
                    title={label}
                    className={`group relative rounded-full transition-transform hover:scale-110 ${selectedAvatar === url ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-transparent scale-110' : ''
                      }`}
                  >
                    <img
                      src={url}
                      alt={label}
                      loading="lazy"
                      className="h-10 w-10 rounded-full bg-gray-100 object-cover"
                    />
                    {selectedAvatar === url && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between border-t border-white/5 pt-4">
                <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Page {currentAvatarPage + 1} of {Math.ceil(PRESET_AVATARS.length / ITEMS_PER_PAGE)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentAvatarPage(p => Math.max(0, p - 1))}
                    disabled={currentAvatarPage === 0}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${currentAvatarPage === 0
                      ? 'cursor-not-allowed opacity-50'
                      : dark
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentAvatarPage(p => Math.min(Math.ceil(PRESET_AVATARS.length / ITEMS_PER_PAGE) - 1, p + 1))}
                    disabled={currentAvatarPage >= Math.ceil(PRESET_AVATARS.length / ITEMS_PER_PAGE) - 1}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${currentAvatarPage >= Math.ceil(PRESET_AVATARS.length / ITEMS_PER_PAGE) - 1
                      ? 'cursor-not-allowed opacity-50'
                      : dark
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Upload tab */}
          {avatarTab === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className={`flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed py-8 transition-colors ${uploadingAvatar
                  ? 'cursor-wait opacity-60'
                  : dark
                    ? 'border-white/10 hover:border-violet-500/50 hover:bg-violet-500/5'
                    : 'border-gray-200 hover:border-violet-400 hover:bg-violet-50/50'
                  }`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                  ) : selectedAvatar && (selectedAvatar.includes('cloudinary.com') || selectedAvatar.includes('res.cloudinary')) ? (
                    <img
                      src={selectedAvatar}
                      alt="preview"
                      className="h-12 w-12 rounded-full object-cover ring-2 ring-violet-500/50"
                      onError={() => setUploadError('Failed to load the uploaded image. Check your connection.')}
                    />
                  ) : (
                    <Camera className="h-5 w-5 text-violet-500" />
                  )}
                </div>
                <div className="text-center">
                  <p className={`text-sm font-medium ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                    {uploadingAvatar
                      ? 'Uploading to Cloudinary…'
                      : selectedAvatar?.startsWith('https://res.cloudinary')
                        ? 'Change photo'
                        : 'Upload a photo'}
                  </p>
                  <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                    JPG, PNG, GIF — max 3 MB · Stored on Cloudinary CDN
                  </p>
                </div>
                {!uploadingAvatar && (
                  <span className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    Browse files
                  </span>
                )}
              </button>
              {uploadError && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" /> {uploadError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Info card ── */}
        <div className={`${cardCls} mb-5 space-y-5`}>
          <h2 className="text-sm font-semibold">Basic Info</h2>

          {/* Display name */}
          <div>
            <label className={labelCls}>
              <User className="h-3.5 w-3.5" /> Display Name
            </label>
            <input
              className={inputCls}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={40}
            />
            <p className={`mt-1 text-right text-xs ${dark ? 'text-gray-600' : 'text-gray-400'}`}>
              {displayName.length}/40
            </p>
          </div>

          {/* Username */}
          <div>
            <label className={labelCls}>
              <AtSign className="h-3.5 w-3.5" /> Username
            </label>
            <div className="relative">
              <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-sm select-none ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                @
              </span>
              <input
                className={`${inputCls} pl-8 ${usernameError
                  ? 'border-red-500/60 focus:border-red-500/60 focus:ring-red-500/20'
                  : usernameOk
                    ? 'border-emerald-500/60 focus:border-emerald-500/60 focus:ring-emerald-500/20'
                    : ''
                  }`}
                value={username}
                onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
                placeholder="your_handle"
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              {/* Validation icon */}
              {username && (
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {usernameChecking ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  ) : usernameError ? (
                    <X className="h-4 w-4 text-red-400" />
                  ) : usernameOk ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : null}
                </span>
              )}
            </div>
            {usernameError && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5" /> {usernameError}
              </p>
            )}
            {!usernameError && usernameOk && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Username available
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className={labelCls}>
              <FileText className="h-3.5 w-3.5" /> Bio
            </label>
            <textarea
              className={`${inputCls} resize-none`}
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell people a little about yourself…"
              rows={3}
              maxLength={160}
            />
            <p className={`mt-1 text-right text-xs ${dark ? 'text-gray-600' : 'text-gray-400'}`}>
              {bio.length}/160
            </p>
          </div>
        </div>

        {/* ── Read-only info card ── */}
        <div className={`${cardCls} mb-8`}>
          <h2 className="mb-4 text-sm font-semibold">Account Info</h2>
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${dark ? 'bg-white/5' : 'bg-gray-50'}`}>
            <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Email</span>
            <span className="text-sm font-medium">{user.email}</span>
          </div>
          <p className={`mt-2 text-xs ${dark ? 'text-gray-600' : 'text-gray-400'}`}>
            Email address cannot be changed here.
          </p>
        </div>

        {/* ── Save / Cancel ── */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => navigate(-1)}
            className={`rounded-xl px-5 py-2.5 text-sm font-medium transition-colors ${dark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !!usernameError || usernameChecking || !displayName.trim()}
            className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${saving || !!usernameError || !displayName.trim()
              ? 'cursor-not-allowed bg-violet-500/50'
              : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02]'
              }`}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            ) : saved ? (
              <><Check className="h-4 w-4" /> Saved!</>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>

        {/* Saved toast */}
        {saved && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
            <Check className="h-4 w-4" />
            Profile updated successfully!
          </div>
        )}

      </div>
    </div>
  );
}
