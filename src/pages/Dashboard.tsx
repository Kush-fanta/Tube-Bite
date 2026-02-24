import { useState, useRef, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import type { ClipSettings, GeneratedClip, Template } from '@/types';
import {
  Upload, Link2, Tv, Youtube, Scissors, Sparkles, Download, Play,
  ChevronDown, ChevronUp, Type, Loader2, Check, X, Clock, Hash,
  RatioIcon, Layers, AlertCircle, RotateCcw, Eye, Brain, Zap,
  TrendingUp, Gamepad2, Mic2, Video, Star, Newspaper, Flame, MonitorPlay
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEMPLATES: (Template & { Icon: any })[] = [
  { id: 'minimal', name: 'Minimal', Icon: MonitorPlay, description: 'Clean, no-frills look. Focused on content.', category: 'Clean' },
  { id: 'gaming', name: 'Gaming', Icon: Gamepad2, description: 'Neon overlays, chat highlights, face cam frame.', category: 'Gaming' },
  { id: 'podcast', name: 'Podcast', Icon: Mic2, description: 'Waveform visuals, speaker names, quotes.', category: 'Talk' },
  { id: 'cinematic', name: 'Cinematic', Icon: Video, description: 'Letterbox bars, film grain, elegant text.', category: 'Premium' },
  { id: 'social', name: 'Social Pop', Icon: Star, description: 'Bold text, emojis, attention-grabbing animations.', category: 'Viral' },
  { id: 'news', name: 'News Flash', Icon: Newspaper, description: 'Lower thirds, ticker style, professional.', category: 'Info' },
];

const ASPECT_RATIOS: { value: ClipSettings['aspectRatio']; label: string; desc: string }[] = [
  { value: '9:16', label: '9:16', desc: 'Shorts / Reels' },
  { value: '1:1', label: '1:1', desc: 'Square' },
  { value: '4:5', label: '4:5', desc: 'Instagram' },
  { value: '16:9', label: '16:9', desc: 'Landscape' },
];

type SourceTab = 'youtube' | 'twitch' | 'upload';

// ─── Processing stages ────────────────────────────────────────────────────────

const PROCESSING_STAGES = [
  'Downloading video…',
  'Extracting audio…',
  'Transcribing speech (Whisper)…',
  'Analysing transcript with AI…',
  'Detecting viral moments…',
  'Ranking by engagement potential…',
  'Extracting selected clips…',
  'Applying aspect ratio (letterbox)…',
  'Burning subtitles…',
  'Uploading to cloud…',
  'Finalising clips…',
];

const UPLOAD_STAGES = [
  'Reading video file…',
  'Uploading to server…',
  'Transcribing speech (Whisper)…',
  'Analysing transcript with AI…',
  'Detecting viral moments…',
  'Ranking by engagement potential…',
  'Extracting selected clips…',
  'Applying aspect ratio (letterbox)…',
  'Burning subtitles…',
  'Uploading to cloud…',
  'Finalising clips…',
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { theme } = useTheme();
  const { getIdToken } = useAuth();
  const dark = theme === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Source
  const [sourceTab, setSourceTab] = useState<SourceTab>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [twitchUrl, setTwitchUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Settings
  const [settings, setSettings] = useState<ClipSettings>({
    duration: 'auto',
    aspectRatio: '9:16',
    numberOfClips: 3,
    generateSubtitles: true,
    template: 'minimal',
    detectionMethod: 'ai',
  });
  const [customDuration, setCustomDuration] = useState(30);
  const [settingsOpen, setSettingsOpen] = useState(true);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  // Results
  const [clips, setClips] = useState<GeneratedClip[]>([]);
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  const [expandedReason, setExpandedReason] = useState<string | null>(null);

  // ── File handling ───────────────────────────────────────────────────────────

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadedFile(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setUploadedFile(file);
  };

  // ── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (sourceTab === 'youtube' && !youtubeUrl.trim()) return;
    if (sourceTab === 'twitch' && !twitchUrl.trim()) return;
    if (sourceTab === 'upload' && !uploadedFile) return;

    setProcessing(true);
    setProgress(0);
    setClips([]);

    const stages = sourceTab === 'upload' ? UPLOAD_STAGES : PROCESSING_STAGES;

    // Animate progress with two speeds:
    //   0–85 %  → 1 tick per 500 ms  (reaches 85 in ~42 s)
    //   85–97 % → 1 tick per 4 000 ms (reaches 97 in ~48 s)
    // Progress is always a whole integer — no decimals shown.
    let tickCount = 0;
    const stageInterval = setInterval(() => {
      tickCount++;
      setProgress(prev => {
        if (prev >= 97) return 97;
        // In the 85–97 range, only advance on every 8th tick (4 000 ms / 500 ms)
        if (prev >= 85 && tickCount % 8 !== 0) return prev;
        const next = Math.min(prev + 1, 97);
        const idx = Math.min(Math.floor((next / 100) * stages.length), stages.length - 1);
        setProgressStage(stages[idx]);
        return next;
      });
    }, 500);

    // 15-minute timeout — the pipeline can be slow (Whisper + LLM + FFmpeg)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000);

    const clipSettings = {
      duration: settings.duration === 'auto' ? 'auto' : String(customDuration),
      aspectRatio: settings.aspectRatio,
      numberOfClips: settings.numberOfClips,
      generateSubtitles: settings.generateSubtitles,
      template: settings.template,
      detectionMethod: 'ai',
    };

    try {
      const token = await getIdToken();
      const headers: HeadersInit = {
        'Authorization': `Bearer ${token}`,
      };

      let response: Response;

      if (sourceTab === 'upload') {
        const formData = new FormData();
        formData.append('file', uploadedFile!);
        formData.append('settings', JSON.stringify(clipSettings));
        response = await fetch('http://localhost:8000/api/clips/generate-from-upload', {
          method: 'POST',
          headers,
          body: formData,
          signal: controller.signal,
        });
      } else if (sourceTab === 'youtube') {
        response = await fetch('http://localhost:8000/api/clips/generate-from-youtube', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: youtubeUrl, settings: clipSettings }),
          signal: controller.signal,
        });
      } else {
        response = await fetch('http://localhost:8000/api/clips/generate-from-url', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: twitchUrl, settings: clipSettings }),
          signal: controller.signal,
        });
      }

      clearInterval(stageInterval);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'completed') {
        setProgress(100);
        setProgressStage('Done!');
        setClips(data.clips);
      }
    } catch (err: any) {
      clearInterval(stageInterval);
      clearTimeout(timeoutId);
      console.error(err);
      if (err.name === 'AbortError') {
        alert('Request timed out after 15 minutes. The video may be too long — try a shorter clip or check the backend logs.');
      } else {
        alert(`Failed to generate clips: ${err.message || 'Please try again.'}`);
      }
    } finally {
      setProcessing(false);
    }
  };

  // ── Download ────────────────────────────────────────────────────────────────

  const handleDownload = (clip: GeneratedClip) => {
    const url = clip.downloadUrl || clip.video_url;
    if (!url || url === '#') { alert('Download not available.'); return; }
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.download = `${clip.title.replace(/\s+/g, '_')}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    setClips([]);
    setYoutubeUrl('');
    setTwitchUrl('');
    setUploadedFile(null);
    setProgress(0);
    setPlayingClip(null);
  };

  const isReady =
    (sourceTab === 'youtube' && youtubeUrl.trim().length > 0) ||
    (sourceTab === 'twitch' && twitchUrl.trim().length > 0) ||
    (sourceTab === 'upload' && uploadedFile !== null);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-[calc(100vh-4rem)] transition-colors duration-300 ${dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Create Clips</h1>
          <p className={`mt-1.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            AI detects the most viral moments from your video — automatically
          </p>
        </div>

        {/* ═══ RESULTS ═══ */}
        {clips.length > 0 ? (
          <div>
            {/* Header row */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold">
                  <Check className="h-5 w-5 text-green-400" />
                  {clips.length} Viral Clips Generated
                </h2>
                <p className={`mt-1 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Detected by <span className="font-medium text-violet-400">AI</span> — ready to download
                </p>
              </div>
              <button
                onClick={handleReset}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-300 hover:bg-gray-100'}`}
              >
                <RotateCcw className="h-4 w-4" />
                Start Over
              </button>
            </div>

            {/* Clip grid */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className={`group overflow-hidden rounded-2xl border transition-all hover:scale-[1.02] ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white shadow-sm'}`}
                >
                  {/* Thumbnail area — correct aspect ratio, no cropping */}
                  <div
                    className={`relative w-full cursor-pointer overflow-hidden ${clip.aspectRatio === '9:16' ? 'aspect-[9/16]' :
                      clip.aspectRatio === '1:1' ? 'aspect-square' :
                        clip.aspectRatio === '4:5' ? 'aspect-[4/5]' :
                          'aspect-video'
                      } ${dark ? 'bg-gray-800' : 'bg-gray-100'} flex items-center justify-center`}
                    onClick={() => setPlayingClip(playingClip === clip.id ? null : clip.id)}
                  >
                    {playingClip === clip.id ? (
                      <video
                        key={clip.id}
                        src={clip.video_url}
                        autoPlay
                        controls
                        playsInline
                        className="h-full w-full object-contain bg-black"
                      />
                    ) : (
                      <>
                        {clip.thumbnail ? (
                          <img
                            src={clip.thumbnail}
                            alt={clip.title}
                            className="h-full w-full object-contain bg-black"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <div className={`flex h-14 w-14 items-center justify-center rounded-full ${dark ? 'bg-violet-500/20' : 'bg-violet-100'}`}>
                              <Play className="h-6 w-6 text-violet-400 ml-0.5" />
                            </div>
                            <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{clip.duration}</p>
                          </div>
                        )}
                        {clip.thumbnail && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                              <Play className="h-6 w-6 text-white ml-0.5" />
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Badges */}
                    <div className="absolute left-2.5 top-2.5 z-10 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-violet-500/90 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        {clip.aspectRatio}
                      </span>
                      {clip.hasSubtitles && (
                        <span className="rounded-md bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold uppercase text-white">CC</span>
                      )}
                    </div>

                    {/* Viral score */}
                    {(clip as any).viralScore !== undefined && (
                      <div className="absolute bottom-2.5 right-2.5 z-10">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 ${dark ? 'bg-black/60 text-fuchsia-300' : 'bg-white/90 text-fuchsia-600'}`}>
                          <Flame className="h-3 w-3" /> {Math.round(((clip as any).viralScore ?? 0) * 100)}% viral
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="truncate text-sm font-semibold">{clip.title}</h3>
                    <p className={`mt-0.5 text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {clip.duration} · Template: {TEMPLATES.find(t => t.id === clip.template)?.name || clip.template}
                    </p>

                    {/* Viral reason */}
                    {(clip as any).viralReason && (
                      <div className={`mt-2 rounded-lg p-2.5 text-xs ${dark ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-violet-50 border border-violet-100'}`}>
                        <p className={`font-semibold mb-0.5 text-violet-400 flex items-center gap-1`}>
                          <TrendingUp className="h-3 w-3" /> Why it'll go viral
                        </p>
                        <p className={`leading-snug ${dark ? 'text-gray-300' : 'text-gray-600'} ${expandedReason === clip.id ? '' : 'line-clamp-2'}`}>
                          {(clip as any).viralReason}
                        </p>
                        {(clip as any).viralReason.length > 90 && (
                          <button
                            onClick={() => setExpandedReason(expandedReason === clip.id ? null : clip.id)}
                            className="mt-1 text-violet-400 hover:text-violet-300 text-[10px] font-medium"
                          >
                            {expandedReason === clip.id ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleDownload(clip)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2 text-xs font-semibold text-white hover:shadow-lg hover:shadow-violet-500/25 transition-all"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </button>
                      <button
                        onClick={() => setPlayingClip(playingClip === clip.id ? null : clip.id)}
                        className={`flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Download All */}
            <div className="mt-8 text-center">
              <button
                onClick={() => clips.forEach(c => handleDownload(c))}
                className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-violet-500/20 hover:shadow-violet-500/35 transition-all hover:scale-[1.02]"
              >
                <Download className="h-5 w-5" /> Download All Clips
              </button>
            </div>
          </div>

        ) : processing ? (
          /* ═══ PROCESSING ═══ */
          <div className={`mx-auto max-w-lg rounded-2xl border p-8 text-center ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white shadow-sm'}`}>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
              <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
            </div>
            <h2 className="text-xl font-bold">AI is Analysing Your Video</h2>
            <p className={`mt-2 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{progressStage}</p>

            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-400">
              <Brain className="h-3.5 w-3.5" /> LLM Viral Moment Detection
            </div>

            <div className="mt-6">
              <div className={`h-3 w-full overflow-hidden rounded-full ${dark ? 'bg-white/5' : 'bg-gray-100'}`}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className={`mt-2 text-sm font-medium ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{Math.round(progress)}%</p>
            </div>

            <div className={`mt-6 rounded-xl p-4 text-left text-xs ${dark ? 'bg-white/5' : 'bg-gray-50'}`}>
              <p className={`font-semibold mb-2 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>Pipeline</p>
              {[
                ['Transcription', 'Whisper (auto-detect language)'],
                ['Detection', 'LLM — dolphin-mistral-24b'],
                ['Aspect ratio', 'Letterbox (no cropping)'],
                ['Subtitles', settings.generateSubtitles ? 'Burned in' : 'Disabled'],
              ].map(([k, v]) => (
                <div key={k} className={`flex justify-between py-0.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                  <span>{k}</span><span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>

        ) : (
          /* ═══ MAIN FORM ═══ */
          <div className="grid gap-6 lg:grid-cols-5">

            {/* Left column */}
            <div className="space-y-6 lg:col-span-3">

              {/* ── Video Source ── */}
              <div className={`rounded-2xl border p-6 ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white shadow-sm'}`}>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                  <Upload className="h-5 w-5 text-violet-400" /> Video Source
                </h2>

                {/* Tab bar */}
                <div className={`mb-5 flex rounded-xl p-1 ${dark ? 'bg-white/5' : 'bg-gray-100'}`}>
                  {([
                    { id: 'youtube' as SourceTab, label: 'YouTube', Icon: Youtube },
                    { id: 'twitch' as SourceTab, label: 'Twitch', Icon: Tv },
                    { id: 'upload' as SourceTab, label: 'Upload File', Icon: Upload },
                  ] as const).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => setSourceTab(id)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${sourceTab === id
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg'
                        : dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>

                {/* YouTube input */}
                {sourceTab === 'youtube' && (
                  <div>
                    <div className="relative">
                      <Link2 className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${dark ? 'text-gray-500' : 'text-gray-400'}`} />
                      <input
                        type="url"
                        value={youtubeUrl}
                        onChange={e => setYoutubeUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className={`w-full rounded-xl border py-3.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-gray-500 ${dark ? 'border-white/10 bg-white/5 text-white focus:border-violet-500' : 'border-gray-300 bg-gray-50 text-gray-900 focus:border-violet-500'}`}
                      />
                    </div>
                  </div>
                )}

                {/* Twitch input */}
                {sourceTab === 'twitch' && (
                  <div>
                    <div className="relative">
                      <Link2 className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${dark ? 'text-gray-500' : 'text-gray-400'}`} />
                      <input
                        type="url"
                        value={twitchUrl}
                        onChange={e => setTwitchUrl(e.target.value)}
                        placeholder="https://www.twitch.tv/videos/..."
                        className={`w-full rounded-xl border py-3.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-gray-500 ${dark ? 'border-white/10 bg-white/5 text-white focus:border-violet-500' : 'border-gray-300 bg-gray-50 text-gray-900 focus:border-violet-500'}`}
                      />
                    </div>
                    <div className={`mt-3 flex items-start gap-2 rounded-lg p-3 text-xs ${dark ? 'bg-purple-500/10 text-purple-300' : 'bg-purple-50 text-purple-600'}`}>
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Supports Twitch VODs. Audio is transcribed with Whisper AI. Clips auto-delete from cloud after 10 days.
                    </div>
                  </div>
                )}

                {/* Upload */}
                {sourceTab === 'upload' && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${dragOver
                      ? 'border-violet-500 bg-violet-500/10'
                      : uploadedFile
                        ? dark ? 'border-green-500/30 bg-green-500/5' : 'border-green-300 bg-green-50'
                        : dark ? 'border-white/10 hover:border-white/20' : 'border-gray-300 hover:border-gray-400'
                      }`}
                  >
                    <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />
                    {uploadedFile ? (
                      <div>
                        <Check className="mx-auto h-10 w-10 text-green-400" />
                        <p className="mt-3 font-medium">{uploadedFile.name}</p>
                        <p className={`mt-1 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                        <button
                          onClick={e => { e.stopPropagation(); setUploadedFile(null); }}
                          className="mt-3 inline-flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
                        >
                          <X className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                    ) : (
                      <div>
                        <Upload className={`mx-auto h-10 w-10 ${dark ? 'text-gray-500' : 'text-gray-400'}`} />
                        <p className="mt-3 font-medium">Drop your video here</p>
                        <p className={`mt-1 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                          or click to browse — MP4, MOV, AVI, MKV, WebM
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── AI Detection info banner ── */}
              <div className={`rounded-2xl border p-5 ${dark ? 'border-violet-500/20 bg-violet-500/5' : 'border-violet-200 bg-violet-50'}`}>
                <div className="flex items-start gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${dark ? 'bg-violet-500/20' : 'bg-violet-100'}`}>
                    <Brain className="h-5 w-5 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-violet-400">AI Viral Detection</h3>
                    <p className={`mt-1 text-sm leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                      The AI transcribes your video with Whisper, then sends the transcript to an LLM
                      (<span className="font-mono text-xs">dolphin-mistral-24b</span> via OpenRouter).
                      The LLM identifies the moments most likely to go viral — surprising reveals, emotional peaks,
                      quotable one-liners — and returns precise start/end timestamps for trimming.
                    </p>
                    <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {[
                        ['Transcription', 'Whisper AI (EN + HI)'],
                        ['Detection', 'LLM moment scoring'],
                        ['Aspect ratio', 'Letterbox — no cropping'],
                        ['Subtitles', 'From transcript, burned in'],
                      ].map(([k, v]) => (
                        <div key={k} className={`rounded-lg p-2 ${dark ? 'bg-white/5' : 'bg-white'}`}>
                          <p className="font-semibold">{k}</p>
                          <p>{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Clip Settings ── */}
              <div className={`overflow-hidden rounded-2xl border ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white shadow-sm'}`}>
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="flex w-full items-center justify-between p-6"
                >
                  <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Sparkles className="h-5 w-5 text-violet-400" /> Clip Settings
                  </h2>
                  {settingsOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </button>

                {settingsOpen && (
                  <div className={`space-y-5 border-t px-6 pb-6 pt-4 ${dark ? 'border-white/5' : 'border-gray-100'}`}>

                    {/* Duration */}
                    <div>
                      <label className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                        <Clock className="h-4 w-4 text-violet-400" /> Clip Duration
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {(['auto', 15, 30, 45, 60] as const).map(d => (
                          <button
                            key={d}
                            onClick={() => {
                              setSettings(s => ({ ...s, duration: d === 'auto' ? 'auto' : Number(d) }));
                              if (typeof d === 'number') setCustomDuration(d);
                            }}
                            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${(d === 'auto' && settings.duration === 'auto') || (typeof d === 'number' && settings.duration === d)
                              ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg'
                              : dark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                          >
                            {d === 'auto' ? <Sparkles className="mr-1.5 h-3.5 w-3.5" /> : null}
                            {d === 'auto' ? 'Auto' : `${d}s`}
                          </button>
                        ))}
                      </div>
                      {settings.duration !== 'auto' && (
                        <div className="mt-3">
                          <input
                            type="range" min={5} max={120} value={customDuration}
                            onChange={e => { const v = Number(e.target.value); setCustomDuration(v); setSettings(s => ({ ...s, duration: v })); }}
                            className="w-full accent-violet-500"
                          />
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>5s</span>
                            <span className="font-medium text-violet-400">{customDuration}s</span>
                            <span>120s</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Aspect Ratio */}
                    <div>
                      <label className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                        <RatioIcon className="h-4 w-4 text-violet-400" /> Aspect Ratio
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {ASPECT_RATIOS.map(({ value, label, desc }) => (
                          <button
                            key={value}
                            onClick={() => setSettings(s => ({ ...s, aspectRatio: value }))}
                            className={`rounded-xl border p-3 text-center transition-all ${settings.aspectRatio === value
                              ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/50'
                              : dark ? 'border-white/10 hover:border-white/20' : 'border-gray-200 hover:border-gray-300'
                              }`}
                          >
                            <span className="block text-lg font-bold">{label}</span>
                            <span className={`text-[11px] ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{desc}</span>
                          </button>
                        ))}
                      </div>
                      <p className={`mt-2 text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                        <AlertCircle className="h-3.5 w-3.5 text-violet-400" /> Aspect ratio uses letterboxing — no face or content is ever cropped out.
                      </p>
                    </div>

                    {/* Number of clips */}
                    <div>
                      <label className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                        <Hash className="h-4 w-4 text-violet-400" /> Number of Clips
                      </label>
                      <div className="flex items-center gap-3">
                        {[1, 2, 3, 5, 10].map(n => (
                          <button
                            key={n}
                            onClick={() => setSettings(s => ({ ...s, numberOfClips: n }))}
                            className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold transition-all ${settings.numberOfClips === n
                              ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg'
                              : dark ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Subtitles */}
                    <div>
                      <label className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                        <Type className="h-4 w-4 text-violet-400" /> Subtitles
                      </label>
                      <button
                        onClick={() => setSettings(s => ({ ...s, generateSubtitles: !s.generateSubtitles }))}
                        className="flex items-center gap-3"
                      >
                        <div className={`relative h-6 w-11 rounded-full transition-colors ${settings.generateSubtitles ? 'bg-violet-500' : dark ? 'bg-white/10' : 'bg-gray-300'}`}>
                          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${settings.generateSubtitles ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </div>
                        <span className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                          {settings.generateSubtitles ? 'Auto-generate & burn subtitles' : 'No subtitles'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6 lg:col-span-2">

              {/* Templates */}
              <div className={`rounded-2xl border p-6 ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white shadow-sm'}`}>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                  <Layers className="h-5 w-5 text-violet-400" /> Template
                </h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSettings(s => ({ ...s, template: t.id }))}
                      className={`rounded-xl border p-3 text-left transition-all ${settings.template === t.id
                        ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/50'
                        : dark ? 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      <t.Icon className={`h-6 w-6 transition-colors ${settings.template === t.id ? 'text-violet-400' : 'text-gray-500'}`} />
                      <p className="mt-1.5 text-sm font-semibold">{t.name}</p>
                      <p className={`mt-0.5 text-[11px] leading-snug ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{t.description}</p>
                      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${dark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{t.category}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary & Generate */}
              <div className={`rounded-2xl border p-6 ${dark ? 'border-white/10 bg-gray-900' : 'border-gray-200 bg-white shadow-sm'}`}>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                  <Scissors className="h-5 w-5 text-violet-400" /> Summary
                </h2>

                <div className={`rounded-xl p-4 text-sm space-y-2.5 ${dark ? 'bg-white/5' : 'bg-gray-50'}`}>
                  {[
                    ['Source', sourceTab === 'youtube' ? (youtubeUrl ? 'YouTube URL' : '—') : sourceTab === 'twitch' ? (twitchUrl ? 'Twitch URL' : '—') : (uploadedFile?.name || '—')],
                    ['Duration', settings.duration === 'auto' ? 'Auto AI selection' : `${customDuration}s`],
                    ['Ratio', `${settings.aspectRatio} (letterbox)`],
                    ['Clips', String(settings.numberOfClips)],
                    ['Subtitles', settings.generateSubtitles ? 'Burned in' : 'Disabled'],
                    ['Template', TEMPLATES.find(t => t.id === settings.template)?.name || settings.template],
                    ['Detection', 'AI (LLM)'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className={dark ? 'text-gray-400' : 'text-gray-500'}>{k}</span>
                      <span className="max-w-[170px] truncate text-right font-medium">{v}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={!isReady}
                  className={`mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-semibold transition-all ${isReady
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02]'
                    : dark ? 'cursor-not-allowed bg-white/5 text-gray-500' : 'cursor-not-allowed bg-gray-100 text-gray-400'
                    }`}
                >
                  <Zap className="h-4 w-4" /> Generate Viral Clips
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
