import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import type { HistoryItem, GeneratedClip } from '@/types';
import {
  History as HistoryIcon, Tv, Upload, Download, Trash2, Eye,
  Clock, Scissors, Search, Filter, ChevronDown, Youtube,
  RotateCcw, AlertTriangle, RefreshCw, Flame, Info, X,
} from 'lucide-react';

const API = 'http://localhost:8000';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Days remaining until permanent deletion (deletedAt + 10 days) */
function daysUntilPurge(deletedAt: string): number {
  const purgeTime = new Date(deletedAt).getTime() + 10 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeTime - Date.now()) / (24 * 60 * 60 * 1000)));
}

function SourceIcon({ type }: { type: 'youtube' | 'twitch' | 'upload' }) {
  if (type === 'youtube') return <Youtube className="h-6 w-6" />;
  if (type === 'twitch') return <Tv className="h-6 w-6" />;
  return <Upload className="h-6 w-6" />;
}

function sourceBg(type: 'youtube' | 'twitch' | 'upload') {
  if (type === 'youtube') return 'bg-red-500/10 text-red-400';
  if (type === 'twitch') return 'bg-purple-500/10 text-purple-400';
  return 'bg-blue-500/10 text-blue-400';
}

// ─── Clip card (inside expanded row) ────────────────────────────────────────

function ClipCard({ clip, dark }: { clip: GeneratedClip; dark: boolean }) {
  const [showReason, setShowReason] = useState(false);

  const handleDownload = () => {
    if (!clip.downloadUrl || clip.downloadUrl === '#') {
      const a = document.createElement('a');
      a.href = 'data:text/plain;charset=utf-8,Tube Bite Demo - ' + clip.title;
      a.download = `${clip.title}.txt`;
      a.click();
      return;
    }
    const link = document.createElement('a');
    link.href = clip.downloadUrl;
    link.target = '_blank';
    link.download = `${clip.title.replace(/\s+/g, '_')}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`rounded-xl border p-3 ${dark ? 'border-white/5 bg-white/[0.02]' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${dark ? 'bg-violet-500/10' : 'bg-violet-50'}`}>
          <Scissors className="h-4 w-4 text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{clip.title}</p>
          <p className={`text-[10px] ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
            {clip.duration} · {clip.aspectRatio}
            {clip.viralScore !== undefined && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-orange-400">
                <Flame className="h-2.5 w-2.5" />
                {Math.round(clip.viralScore * 100)}% viral
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {clip.viralReason && (
            <button
              onClick={() => setShowReason(!showReason)}
              className={`rounded-lg p-1.5 transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              title="Why viral?"
            >
              <Info className="h-3.5 w-3.5 text-violet-400" />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="shrink-0 rounded-lg bg-violet-500/10 p-2 text-violet-400 hover:bg-violet-500/20 transition-colors"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {showReason && clip.viralReason && (
        <div className={`mt-2 rounded-lg p-2 text-[10px] leading-relaxed ${dark ? 'bg-white/5 text-gray-300' : 'bg-violet-50 text-violet-800'}`}>
          {clip.viralReason}
        </div>
      )}
    </div>
  );
}

// ─── History row ─────────────────────────────────────────────────────────────

interface HistoryRowProps {
  item: HistoryItem;
  dark: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSoftDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  isTrash: boolean;
}

function HistoryRow({
  item, dark, expanded, onToggle,
  onSoftDelete, onRestore, onPermanentDelete, isTrash,
}: HistoryRowProps) {
  const days = item.deletedAt ? daysUntilPurge(item.deletedAt) : null;

  return (
    <div className={`overflow-hidden rounded-2xl border transition-all ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white shadow-sm'}`}>
      {/* Main row */}
      <div className="flex items-center gap-4 p-5">
        {/* Source icon */}
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${sourceBg(item.sourceType)}`}>
          <SourceIcon type={item.sourceType} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{item.sourceName}</h3>
          <div className={`mt-1 flex flex-wrap items-center gap-3 text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatDate(item.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Scissors className="h-3 w-3" /> {item.clips.length} clips
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${item.status === 'completed'
              ? 'bg-green-500/10 text-green-400'
              : item.status === 'processing'
                ? 'bg-yellow-500/10 text-yellow-400'
                : 'bg-red-500/10 text-red-400'
              }`}>
              {item.status}
            </span>
            {isTrash && days !== null && (
              <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${days <= 2 ? 'bg-red-500/10 text-red-400' : 'bg-orange-500/10 text-orange-400'
                }`}>
                <AlertTriangle className="h-2.5 w-2.5" />
                {days === 0 ? 'Deletes today' : `Deletes in ${days}d`}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className={`rounded-lg p-2.5 transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            title="View clips"
          >
            <Eye className="h-4 w-4" />
          </button>

          {isTrash ? (
            <>
              <button
                onClick={() => onRestore(item.id)}
                className="rounded-lg p-2.5 text-green-400 hover:bg-green-500/10 transition-colors"
                title="Restore"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => onPermanentDelete(item.id)}
                className="rounded-lg p-2.5 text-red-400 hover:bg-red-500/10 transition-colors"
                title="Delete permanently"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => onSoftDelete(item.id)}
              className="rounded-lg p-2.5 text-red-400 hover:bg-red-500/10 transition-colors"
              title="Move to trash"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded clips */}
      {expanded && (
        <div className={`border-t px-5 py-4 ${dark ? 'border-white/5 bg-white/[0.01]' : 'border-gray-100 bg-gray-50'}`}>
          <p className={`mb-3 text-xs font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            Settings: {item.settings.aspectRatio} ·{' '}
            {item.settings.duration === 'auto' ? 'Auto duration' : `${item.settings.duration}s`} ·{' '}
            {item.settings.generateSubtitles ? 'With subtitles' : 'No subtitles'} ·{' '}
            Template: {item.settings.template} ·{' '}
            AI detection
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {item.clips.map(clip => (
              <ClipCard key={clip.id} clip={clip} dark={dark} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  dark, message, confirmLabel, confirmClass, onConfirm, onCancel,
}: {
  dark: boolean;
  message: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${dark ? 'border-white/10 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <p className="mt-1 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
          >
            Cancel
          </button>
          <button onClick={onConfirm} className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${confirmClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'active' | 'trash';
type FilterType = 'all' | 'youtube' | 'twitch' | 'upload';

export default function History() {
  const { theme } = useTheme();
  const { getIdToken } = useAuth();
  const dark = theme === 'dark';

  const [tab, setTab] = useState<Tab>('active');
  const [activeItems, setActiveItems] = useState<HistoryItem[]>([]);
  const [trashItems, setTrashItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirm, setConfirm] = useState<{
    message: string;
    confirmLabel: string;
    confirmClass: string;
    onConfirm: () => void;
  } | null>(null);

  // ── Fetch from backend (or localStorage fallback) ──────────────────────────
  const fetchHistory = useCallback(async () => {
    // Only fetch if we have a user/token attempt
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        // Not logged in or loading? 
        // If we don't have a token, we can't fetch from backend.
        // We'll just show local data if any, but clear error.
        setLoading(false);
        return;
      }

      const res = await fetch(`${API}/api/clips/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error(`Server error ${res.status}`);
      }

      const data = await res.json();
      setActiveItems(data.active ?? []);
      setTrashItems(data.trash ?? []);
    } catch (err: any) {
      console.error("History fetch error:", err);
      // specific check for network error vs server error
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        setError('Could not reach backend. Please check your connection.');
      } else {
        setError(err.message || 'Failed to load history.');
      }
      // No localStorage fallback
      setActiveItems([]);
      setTrashItems([]);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Soft delete (move to trash) ────────────────────────────────────────────
  const handleSoftDelete = (id: string) => {
    const doIt = async () => {
      setConfirm(null);
      try {
        const token = await getIdToken();
        await fetch(`${API}/api/clips/history/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch {
        // optimistic update even if backend unreachable
      }
      const item = activeItems.find(i => i.id === id);
      if (!item) return;
      const trashed: HistoryItem = { ...item, deletedAt: new Date().toISOString() };
      setActiveItems(prev => prev.filter(i => i.id !== id));
      setTrashItems(prev => [trashed, ...prev]);
    };

    setConfirm({
      message: 'Move this item to the trash? You can restore it within 10 days before it is permanently deleted.',
      confirmLabel: 'Move to Trash',
      confirmClass: 'bg-red-500 hover:bg-red-600',
      onConfirm: doIt,
    });
  };

  // ── Restore ────────────────────────────────────────────────────────────────
  const handleRestore = async (id: string) => {
    try {
      const token = await getIdToken();
      await fetch(`${API}/api/clips/history/${id}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch {
      // optimistic
    }
    const item = trashItems.find(i => i.id === id);
    if (!item) return;
    const restored: HistoryItem = { ...item, deletedAt: undefined };
    setTrashItems(prev => prev.filter(i => i.id !== id));
    setActiveItems(prev => [restored, ...prev]);
    _syncLocalStorage([restored, ...activeItems], trashItems.filter(i => i.id !== id));
  };

  // ── Permanent delete ───────────────────────────────────────────────────────
  const handlePermanentDelete = (id: string) => {
    const doIt = async () => {
      setConfirm(null);
      try {
        const token = await getIdToken();
        await fetch(`${API}/api/clips/history/${id}/permanent`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch {
        // optimistic
      }
      const newTrash = trashItems.filter(i => i.id !== id);
      setTrashItems(newTrash);
      _syncLocalStorage(activeItems, newTrash);
    };

    setConfirm({
      message: 'Permanently delete this item? This cannot be undone and any cloud assets will be removed.',
      confirmLabel: 'Delete Forever',
      confirmClass: 'bg-red-600 hover:bg-red-700',
      onConfirm: doIt,
    });
  };

  // ── Clear all active ───────────────────────────────────────────────────────
  const handleClearAll = () => {
    const doIt = async () => {
      setConfirm(null);
      const now = new Date().toISOString();
      const newlyTrashed = activeItems.map(i => ({ ...i, deletedAt: now }));
      // fire-and-forget delete calls
      const token = await getIdToken();
      for (const item of activeItems) {
        fetch(`${API}/api/clips/history/${item.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => { });
      }
      setActiveItems([]);
      setTrashItems(prev => [...newlyTrashed, ...prev]);
      _syncLocalStorage([], [...newlyTrashed, ...trashItems]);
    };

    setConfirm({
      message: `Move all ${activeItems.length} item(s) to the trash? They will be permanently deleted after 10 days.`,
      confirmLabel: 'Move All to Trash',
      confirmClass: 'bg-red-500 hover:bg-red-600',
      onConfirm: doIt,
    });
  };

  // ── Empty trash ────────────────────────────────────────────────────────────
  const handleEmptyTrash = () => {
    const doIt = async () => {
      setConfirm(null);
      const token = await getIdToken();
      for (const item of trashItems) {
        fetch(`${API}/api/clips/history/${item.id}/permanent`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => { });
      }
      setTrashItems([]);
      _syncLocalStorage(activeItems, []);
    };

    setConfirm({
      message: `Permanently delete all ${trashItems.length} item(s) in the trash? This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      confirmClass: 'bg-red-600 hover:bg-red-700',
      onConfirm: doIt,
    });
  };

  // ── localStorage sync helper ───────────────────────────────────────────────
  function _syncLocalStorage(active: HistoryItem[], trash: HistoryItem[]) {
    const all = [...active, ...trash];
    localStorage.setItem('tubebite-history', JSON.stringify(all));
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  const items = tab === 'active' ? activeItems : trashItems;
  const filtered = items.filter(item => {
    const matchSearch = item.sourceName.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || item.sourceType === filterType;
    return matchSearch && matchType;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-[calc(100vh-4rem)] transition-colors duration-300 ${dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold">
              <HistoryIcon className="h-7 w-7 text-violet-400" /> History
            </h1>
            <p className={`mt-1.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
              Your previously generated clips
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchHistory}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {tab === 'active' && activeItems.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" /> Move All to Trash
              </button>
            )}
            {tab === 'trash' && trashItems.length > 0 && (
              <button
                onClick={handleEmptyTrash}
                className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" /> Empty Trash
              </button>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${dark ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300' : 'border-yellow-400/30 bg-yellow-50 text-yellow-700'}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className={`mb-6 flex rounded-xl border p-1 ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white'}`}>
          {([
            { id: 'active' as Tab, label: 'Active', count: activeItems.length },
            { id: 'trash' as Tab, label: 'Trash', count: trashItems.length },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setExpandedId(null); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${tab === t.id
                ? dark
                  ? 'bg-white/10 text-white'
                  : 'bg-violet-50 text-violet-700 shadow-sm'
                : dark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-500 hover:text-gray-900'
                }`}
            >
              {t.id === 'trash' && <Trash2 className="h-3.5 w-3.5" />}
              {t.label}
              {t.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.id
                  ? dark ? 'bg-white/20' : 'bg-violet-200 text-violet-700'
                  : dark ? 'bg-white/10 text-gray-400' : 'bg-gray-100 text-gray-600'
                  }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Trash info banner */}
        {tab === 'trash' && (
          <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${dark ? 'border-orange-500/20 bg-orange-500/10 text-orange-300' : 'border-orange-400/30 bg-orange-50 text-orange-700'}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Items in the trash are automatically deleted after <strong>10 days</strong>. You can restore them before that deadline.</span>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className={`flex items-center justify-center rounded-2xl border py-20 ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white'}`}>
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-violet-400" />
              <p className={dark ? 'text-gray-400' : 'text-gray-500'}>Loading history…</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          /* Empty state */
          <div className={`rounded-2xl border py-20 text-center ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white'}`}>
            {tab === 'trash'
              ? <Trash2 className={`mx-auto h-16 w-16 ${dark ? 'text-gray-700' : 'text-gray-300'}`} />
              : <HistoryIcon className={`mx-auto h-16 w-16 ${dark ? 'text-gray-700' : 'text-gray-300'}`} />
            }
            <h2 className="mt-4 text-xl font-bold">
              {tab === 'trash' ? 'Trash is empty' : 'No clips yet'}
            </h2>
            <p className={`mt-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
              {tab === 'trash'
                ? 'Deleted items will appear here for 10 days before being permanently removed.'
                : 'Generate your first clips from the dashboard.'
              }
            </p>
          </div>
        ) : (
          <>
            {/* Search & Filter */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${dark ? 'text-gray-500' : 'text-gray-400'}`} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by source name…"
                  className={`w-full rounded-xl border py-3 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-gray-500 ${dark
                    ? 'border-white/10 bg-white/5 text-white focus:border-violet-500'
                    : 'border-gray-300 bg-white text-gray-900 focus:border-violet-500'
                    }`}
                />
              </div>
              <div className="relative">
                <button
                  onClick={() => setFilterOpen(!filterOpen)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-300 bg-white hover:bg-gray-50'
                    }`}
                >
                  <Filter className="h-4 w-4" />
                  {filterType === 'all' ? 'All Sources' : filterType === 'youtube' ? 'YouTube' : filterType === 'twitch' ? 'Twitch' : 'Uploads'}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {filterOpen && (
                  <>
                    <div className="fixed inset-0" onClick={() => setFilterOpen(false)} />
                    <div className={`absolute right-0 z-10 mt-1.5 w-44 rounded-xl border p-1 shadow-xl ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                      {(['all', 'youtube', 'twitch', 'upload'] as FilterType[]).map(t => (
                        <button
                          key={t}
                          onClick={() => { setFilterType(t); setFilterOpen(false); }}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${filterType === t
                            ? dark ? 'bg-violet-500/10 text-violet-400' : 'bg-violet-50 text-violet-600'
                            : dark ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                            }`}
                        >
                          {t === 'all' ? 'All Sources' : t === 'youtube' ? 'YouTube' : t === 'twitch' ? 'Twitch' : 'Uploads'}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Items list */}
            <div className="space-y-4">
              {filtered.map(item => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  dark={dark}
                  expanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onSoftDelete={handleSoftDelete}
                  onRestore={handleRestore}
                  onPermanentDelete={handlePermanentDelete}
                  isTrash={tab === 'trash'}
                />
              ))}

              {filtered.length === 0 && (
                <div className={`rounded-2xl border py-12 text-center ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                  <Search className={`mx-auto h-10 w-10 ${dark ? 'text-gray-700' : 'text-gray-300'}`} />
                  <p className="mt-3 font-medium">No matching results</p>
                  <p className={`mt-1 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Try adjusting your search or filter
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          dark={dark}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          confirmClass={confirm.confirmClass}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
