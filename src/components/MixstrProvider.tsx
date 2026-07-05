import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { MixstrContext, type AudioTrack, type FeedViewMode } from '@/contexts/MixstrContext';
import {
  loadSidebarLists,
  saveSidebarLists,
  type SidebarList,
} from '@/lib/sidebarLists';
import {
  loadSpamSettings,
  saveSpamSettings,
  mergeSpamSettings,
  type SpamSettings,
} from '@/lib/spam';
import { useMixstrSync, type MixstrConfig } from '@/hooks/useMixstrBackup';
import { useCurrentUser } from '@/hooks/useCurrentUser';

function MixstrSyncInner({
  sidebarLists,
  feedViewModes,
  spamSettings,
  onRemoteLoaded,
  onScheduleBackup,
}: {
  sidebarLists: SidebarList[];
  feedViewModes: Record<string, FeedViewMode>;
  spamSettings: SpamSettings;
  onRemoteLoaded: (config: MixstrConfig) => void;
  onScheduleBackup: (fn: () => void) => void;
}) {
  const { scheduleBackup } = useMixstrSync({ sidebarLists, feedViewModes, spamSettings, onRemoteLoaded });

  // Expose scheduleBackup up to parent on each render
  useEffect(() => {
    onScheduleBackup(scheduleBackup);
  });

  return null;
}

export function MixstrProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const activePubkeyRef = useRef<string | undefined>(undefined);

  const [feedViewModes, setFeedViewModes] = useState<Record<string, FeedViewMode>>({});
  const [sidebarLists, setSidebarListsState] = useState<SidebarList[]>(() =>
    loadSidebarLists(undefined),
  );
  const [spamSettings, setSpamSettingsState] = useState<SpamSettings>(() =>
    loadSpamSettings(undefined),
  );
  const [audioQueue, setAudioQueue] = useState<AudioTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const currentIndexRef = useRef<number>(-1);
  const scheduleBackupRef = useRef<() => void>(() => {});

  // ── Reload lists when the active account changes ──────────────────────────
  // This runs whenever `user` changes (login / logout / switch).
  // We compare the pubkey to avoid re-running on unrelated re-renders.
  useEffect(() => {
    const newPubkey = user?.pubkey;
    if (newPubkey === activePubkeyRef.current) return;

    activePubkeyRef.current = newPubkey;

    // Load the lists that belong to this account (or defaults if none stored)
    const lists = loadSidebarLists(newPubkey);
    setSidebarListsState(lists);

    // Load spam settings for this account
    setSpamSettingsState(loadSpamSettings(newPubkey));

    // Reset view modes — they'll be restored from the Nostr backup if available
    setFeedViewModes({});
  }, [user?.pubkey]);

  const setFeedViewMode = useCallback((feedKey: string, mode: FeedViewMode) => {
    setFeedViewModes((prev) => {
      const next = { ...prev, [feedKey]: mode };
      // Schedule a backup whenever view mode changes
      setTimeout(() => scheduleBackupRef.current(), 0);
      return next;
    });
  }, []);

  const setSpamSettings = useCallback((next: SpamSettings) => {
    setSpamSettingsState(next);
    saveSpamSettings(next, activePubkeyRef.current);
    setTimeout(() => scheduleBackupRef.current(), 0);
  }, []);

  // Called when the remote Nostr config is fetched and newer than local
  const handleRemoteLoaded = useCallback((config: MixstrConfig) => {
    setSidebarListsState((local) => {
      // Only override if the remote savedAt is more recent than local createdAt heuristic
      const remoteTs = config.savedAt ?? 0;
      const localMaxTs = Math.max(...local.map((l) => l.createdAt ?? 0), 0);
      if (remoteTs > localMaxTs) {
        saveSidebarLists(config.sidebarLists, activePubkeyRef.current);
        return config.sidebarLists;
      }
      return local;
    });
    setFeedViewModes((local) => {
      const remoteTs = config.savedAt ?? 0;
      // Simple heuristic: only override if remote was saved after any local timestamp
      // Use the remote view modes only if we have nothing local
      if (Object.keys(local).length === 0 && remoteTs > 0) {
        return config.feedViewModes ?? local;
      }
      return local;
    });
    setSpamSettingsState((local) => {
      const remoteTs = config.savedAt ?? 0;
      if (remoteTs > 0 && config.spamSettings) {
        const merged = mergeSpamSettings(config.spamSettings);
        saveSpamSettings(merged, activePubkeyRef.current);
        return merged;
      }
      return local;
    });
  }, []);

  // Sidebar list management
  const setSidebarLists = useCallback((lists: SidebarList[]) => {
    setSidebarListsState(lists);
    saveSidebarLists(lists, activePubkeyRef.current);
    setTimeout(() => scheduleBackupRef.current(), 0);
  }, []);

  const addSidebarList = useCallback((list: SidebarList) => {
    setSidebarListsState((prev) => {
      const next = [...prev, list];
      saveSidebarLists(next, activePubkeyRef.current);
      setTimeout(() => scheduleBackupRef.current(), 0);
      return next;
    });
  }, []);

  const updateSidebarList = useCallback((id: string, patch: Partial<SidebarList>) => {
    setSidebarListsState((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, ...patch } : l));
      saveSidebarLists(next, activePubkeyRef.current);
      setTimeout(() => scheduleBackupRef.current(), 0);
      return next;
    });
  }, []);

  const removeSidebarList = useCallback((id: string) => {
    setSidebarListsState((prev) => {
      const next = prev.filter((l) => l.id !== id);
      saveSidebarLists(next, activePubkeyRef.current);
      setTimeout(() => scheduleBackupRef.current(), 0);
      return next;
    });
  }, []);

  // Audio player
  const playTrack = useCallback((track: AudioTrack) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setAudioProgress(0);
    setAudioQueue((prev) => {
      const idx = prev.findIndex((t) => t.event.id === track.event.id);
      if (idx >= 0) {
        currentIndexRef.current = idx;
        return prev;
      }
      const newQueue = [track, ...prev];
      currentIndexRef.current = 0;
      return newQueue;
    });
  }, []);

  const addToQueue = useCallback((track: AudioTrack) => {
    setAudioQueue((prev) => {
      const exists = prev.some((t) => t.event.id === track.event.id);
      if (exists) return prev;
      return [...prev, track];
    });
  }, []);

  const playNext = useCallback(() => {
    setAudioQueue((queue) => {
      if (queue.length === 0) return queue;
      const currentIdx = currentTrack
        ? queue.findIndex((t) => t.event.id === currentTrack.event.id)
        : -1;
      const nextIdx = (currentIdx + 1) % queue.length;
      setCurrentTrack(queue[nextIdx]);
      setIsPlaying(true);
      setAudioProgress(0);
      return queue;
    });
  }, [currentTrack]);

  const playPrev = useCallback(() => {
    setAudioQueue((queue) => {
      if (queue.length === 0) return queue;
      const currentIdx = currentTrack
        ? queue.findIndex((t) => t.event.id === currentTrack.event.id)
        : -1;
      const prevIdx = currentIdx <= 0 ? queue.length - 1 : currentIdx - 1;
      setCurrentTrack(queue[prevIdx]);
      setIsPlaying(true);
      setAudioProgress(0);
      return queue;
    });
  }, [currentTrack]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const clearQueue = useCallback(() => {
    setAudioQueue([]);
    setCurrentTrack(null);
    setIsPlaying(false);
  }, []);

  return (
    <MixstrContext.Provider
      value={{
        feedViewModes,
        setFeedViewMode,
        sidebarLists,
        setSidebarLists,
        addSidebarList,
        updateSidebarList,
        removeSidebarList,
        spamSettings,
        setSpamSettings,
        audioQueue,
        currentTrack,
        isPlaying,
        addToQueue,
        playTrack,
        playNext,
        playPrev,
        togglePlay,
        clearQueue,
        audioProgress,
        setAudioProgress,
        audioDuration,
        setAudioDuration,
      }}
    >
      {/* Sync component — rendered inside the provider so it can access Nostr hooks */}
      <MixstrSyncInner
        sidebarLists={sidebarLists}
        feedViewModes={feedViewModes}
        spamSettings={spamSettings}
        onRemoteLoaded={handleRemoteLoaded}
        onScheduleBackup={(fn) => { scheduleBackupRef.current = fn; }}
      />
      {children}
    </MixstrContext.Provider>
  );
}
