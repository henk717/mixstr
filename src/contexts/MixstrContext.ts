import { createContext } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

export type FeedViewMode = 'short' | 'longform' | 'media' | 'audio';

export interface AudioTrack {
  event: NostrEvent;
  title: string;
  url: string;
  artist?: string;
  artwork?: string;
}

export interface MixstrContextType {
  /** Current view mode per feed key */
  feedViewModes: Record<string, FeedViewMode>;
  setFeedViewMode: (feedKey: string, mode: FeedViewMode) => void;

  /** Audio player queue */
  audioQueue: AudioTrack[];
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  addToQueue: (track: AudioTrack) => void;
  playTrack: (track: AudioTrack) => void;
  playNext: () => void;
  playPrev: () => void;
  togglePlay: () => void;
  clearQueue: () => void;
  audioProgress: number; // 0–1
  setAudioProgress: (p: number) => void;
  audioDuration: number;
  setAudioDuration: (d: number) => void;
}

export const MixstrContext = createContext<MixstrContextType | undefined>(undefined);
