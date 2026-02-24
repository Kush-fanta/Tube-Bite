export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  username?: string; // unique handle, e.g. "john_doe"
}

// Only one detection method now — AI powered via LLM
export type DetectionMethod = 'ai';

export interface ClipSettings {
  duration: 'auto' | number;
  aspectRatio: '9:16' | '1:1' | '4:5' | '16:9';
  numberOfClips: number;
  generateSubtitles: boolean;
  template: string;
  detectionMethod: DetectionMethod;
}

export interface VideoSource {
  type: 'youtube' | 'twitch' | 'upload';
  url?: string;
  file?: File;
  fileName?: string;
  thumbnail?: string;
}

export interface GeneratedClip {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  aspectRatio: string;
  template: string;
  hasSubtitles: boolean;
  video_url: string;
  downloadUrl: string;
  createdAt: string;
  detectionMethod?: string;
  viralReason?: string;     // LLM explanation of why this moment is viral
  viralScore?: number;      // 0-1 score from LLM
  startTime?: number;       // seconds in original video
  endTime?: number;         // seconds in original video
}

export interface HistoryItem {
  id: string;
  sourceType: 'youtube' | 'twitch' | 'upload';
  sourceName: string;
  sourceThumbnail: string;
  clips: GeneratedClip[];
  settings: ClipSettings;
  createdAt: string;
  status: 'completed' | 'processing' | 'failed';
  // Trash / soft-delete support
  deletedAt?: string;       // ISO timestamp when moved to trash
  trashedAt?: string;       // alias used internally
}

export type Theme = 'dark' | 'light';

export interface Template {
  id: string;
  name: string;
  preview?: string;
  description: string;
  category: string;
}
