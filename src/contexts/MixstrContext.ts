import { createContext } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import type { SidebarList } from '@/lib/sidebarLists';
import type { SpamSettings } from '@/lib/spam';

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

  /** Sidebar lists */
  sidebarLists: SidebarList[];
  setSidebarLists: (lists: SidebarList[]) => void;
  addSidebarList: (list: SidebarList) => void;
  updateSidebarList: (id: string, list: Partial<SidebarList>) => void;
  removeSidebarList: (id: string) => void;

  /** Automatic spam-detection settings */
  spamSettings: SpamSettings;
  setSpamSettings: (settings: SpamSettings) => void;

  /** Last notification read timestamp (Unix seconds) */
  lastNotificationReadAt: number;
  setLastNotificationReadAt: (timestamp: number) => void;

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
  audioProgress: number;
  setAudioProgress: (p: number) => void;
  audioDuration: number;
  setAudioDuration: (d: number) => void;
}

export const MixstrContext = createContext<MixstrContextType | undefined>(undefined);
