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
import { useMixstrSync, type MixstrConfig, type PubkeyMismatchInfo, clearLocalOwnerPubkey, setLocalOwnerPubkey } from '@/hooks/useMixstrBackup';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/useToast';
import { nip19 } from 'nostr-tools';

function MixstrSyncInner({
  sidebarLists,
  feedViewModes,
  spamSettings,
  lastNotificationReadAt,
  onRemoteLoaded,
  onPubkeyMismatch,
  onScheduleBackup,
}: {
  sidebarLists: SidebarList[];
  feedViewModes: Record<string, FeedViewMode>;
  spamSettings: SpamSettings;
  lastNotificationReadAt: number;
  onRemoteLoaded: (config: MixstrConfig) => void;
  onPubkeyMismatch: (mismatchInfo: PubkeyMismatchInfo) => void;
  onScheduleBackup: (fn: () => void) => void;
}) {
  const { scheduleBackup } = useMixstrSync({ sidebarLists, feedViewModes, spamSettings, lastNotificationReadAt, onRemoteLoaded, onPubkeyMismatch });

  // Expose scheduleBackup up to parent on each render
  useEffect(() => {
    onScheduleBackup(scheduleBackup);
  });

  return null;
}

export function MixstrProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const activePubkeyRef = useRef<string | undefined>(undefined);
  // Tracks which account we have already merged remote config for, so a late
  // local-load effect does not clobber the remote lists.
  const remoteLoadedForPubkey = useRef<string | undefined>(undefined);

  const [feedViewModes, setFeedViewModes] = useState<Record<string, FeedViewMode>>({});
  const [sidebarLists, setSidebarListsState] = useState<SidebarList[]>(() =>
    loadSidebarLists(undefined),
  );
  const [spamSettings, setSpamSettingsState] = useState<SpamSettings>(() =>
    loadSpamSettings(undefined),
  );
  const [lastNotificationReadAt, setLastNotificationReadAt] = useState<number>(0);
  const [audioQueue, setAudioQueue] = useState<AudioTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const currentIndexRef = useRef<number>(-1);
  const scheduleBackupRef = useRef<() => void>(() => {});
  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [mismatchInfo, setMismatchInfo] = useState<PubkeyMismatchInfo | null>(null);
  const { toast } = useToast();

  // ── Reload lists when the active account changes ──────────────────────────
  // This runs whenever `user` changes (login / logout / switch).
  // We compare the pubkey to avoid re-running on unrelated re-renders.
  useEffect(() => {
    const newPubkey = user?.pubkey;
    if (newPubkey === activePubkeyRef.current) return;

    activePubkeyRef.current = newPubkey;

    // Clear the ownerPubkey tracking for this account so the sync hook can
    // re-initialize it properly. This prevents stale ownerPubkey values from
    // blocking the remote config from loading.
    if (newPubkey) {
      clearLocalOwnerPubkey(newPubkey);
    }

    // Reset to defaults immediately - don't load localStorage yet
    // Wait for remote config to load before applying
    const defaultLists = loadSidebarLists(undefined);
    setSidebarListsState(defaultLists);
    
    const defaultSpam = loadSpamSettings(undefined);
    setSpamSettingsState(defaultSpam);
    
    // Reset view modes — they'll be restored from the Nostr backup if available
    setFeedViewModes({});
    
    // Reset the remote loaded flag so the sync hook can apply the remote config
    remoteLoadedForPubkey.current = undefined;
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

  const setLastNotificationReadAtHandler = useCallback((timestamp: number) => {
    setLastNotificationReadAt(timestamp);
    setTimeout(() => scheduleBackupRef.current(), 0);
  }, []);

  // Called when the remote Nostr config is fetched for the current user
  const handleRemoteLoaded = useCallback((config: MixstrConfig) => {
    // Remote config is verified to belong to current user (ownerPubkey matches)
    // Always load it to ensure we have the correct settings for this account
    const currentPubkey = activePubkeyRef.current;
    
    setSidebarListsState((local) => {
      const normalized = config.sidebarLists.map((l) => ({
        ...l,
        createdAt: l.createdAt && l.createdAt > 1e12 ? Math.floor(l.createdAt / 1000) : l.createdAt ?? 0,
      }));
      saveSidebarLists(normalized, currentPubkey);
      remoteLoadedForPubkey.current = currentPubkey;
      return normalized;
    });
    setFeedViewModes(config.feedViewModes ?? {});
    setSpamSettingsState((local) => {
      if (config.spamSettings) {
        const merged = mergeSpamSettings(config.spamSettings);
        saveSpamSettings(merged, currentPubkey);
        return merged;
      }
      return local;
    });
    setLastNotificationReadAt((local) => {
      if (config.lastNotificationReadAt && config.lastNotificationReadAt > local) {
        return config.lastNotificationReadAt;
      }
      return local;
    });
  }, []);

  // Called when a pubkey mismatch is detected
  const handlePubkeyMismatch = useCallback((mismatchInfo: PubkeyMismatchInfo) => {
    if (mismatchInfo.isMismatch && mismatchInfo.remoteOwnerPubkey && mismatchInfo.localPubkey) {
      setMismatchInfo(mismatchInfo);
      setShowMismatchDialog(true);
    }
  }, []);

  // Handle user keeping local settings and overwriting cloud
  const handleKeepLocalSettings = useCallback(() => {
    if (!mismatchInfo || !activePubkeyRef.current) return;

    const currentPubkey = activePubkeyRef.current;
    
    // Set the local ownerPubkey to current user
    setLocalOwnerPubkey(currentPubkey, currentPubkey);
    
    // Local settings are already in place, just need to save them to Nostr
    // This will overwrite the cloud settings with the current account's data
    scheduleBackupRef.current();

    // Show success toast
    toast({
      title: 'Settings synced',
      description: 'Your local settings have been saved to the cloud and will now be associated with your current account.',
    });

    setShowMismatchDialog(false);
    setMismatchInfo(null);
  }, [mismatchInfo, scheduleBackupRef, toast]);

  // Handle user loading remote settings from cloud
  const handleLoadRemoteSettings = useCallback(() => {
    if (!mismatchInfo || !activePubkeyRef.current) return;

    // Fetch the remote config again and load it
    // We need to trigger a fresh fetch and then apply the remote config
    const currentPubkey = activePubkeyRef.current;

    // Clear the local ownerPubkey so it can be re-synced from remote
    clearLocalOwnerPubkey(currentPubkey);

    // Clear local settings for this account
    const defaultLists = loadSidebarLists(undefined);
    setSidebarListsState(defaultLists);
    saveSidebarLists(defaultLists, currentPubkey);

    setFeedViewModes({});

    const defaultSpam = loadSpamSettings(undefined);
    setSpamSettingsState(defaultSpam);
    saveSpamSettings(defaultSpam, currentPubkey);

    setLastNotificationReadAt(0);

    // Reset the remote loaded flag so the sync hook can re-apply the remote config
    remoteLoadedForPubkey.current = undefined;

    // Show info toast
    toast({
      title: 'Remote settings loaded',
      description: 'Your settings from the cloud have been loaded. Local settings have been replaced.',
    });

    setShowMismatchDialog(false);
    setMismatchInfo(null);
  }, [mismatchInfo, activePubkeyRef, toast]);

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
          lastNotificationReadAt,
          setLastNotificationReadAt: setLastNotificationReadAtHandler,
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
        lastNotificationReadAt={lastNotificationReadAt}
        onRemoteLoaded={handleRemoteLoaded}
        onPubkeyMismatch={handlePubkeyMismatch}
        onScheduleBackup={(fn) => { scheduleBackupRef.current = fn; }}
      />

      {/* Pubkey Mismatch Dialog */}
      <AlertDialog open={showMismatchDialog} onOpenChange={setShowMismatchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Settings Sync Conflict Detected</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                The settings stored in the cloud belong to a different account than your current one.
              </p>
              <div className="space-y-2 text-sm">
                <p><strong>Your current account:</strong></p>
                <p className="font-mono break-all text-muted-foreground">
                  {mismatchInfo?.localPubkey 
                    ? nip19.npubEncode(mismatchInfo.localPubkey) 
                    : 'Unknown'}
                </p>
                <p><strong>Cloud settings owner:</strong></p>
                <p className="font-mono break-all text-muted-foreground">
                  {mismatchInfo?.remoteOwnerPubkey 
                    ? nip19.npubEncode(mismatchInfo.remoteOwnerPubkey) 
                    : 'Unknown'}
                </p>
              </div>
              <p className="pt-2">
                Please choose how you'd like to resolve this:
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel onClick={handleLoadRemoteSettings}>
              Load Cloud Settings
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleKeepLocalSettings}>
              Keep Local Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {children}
    </MixstrContext.Provider>
  );
}
