/**
 * NIP-78 encrypted backup/restore for Mixstr user config.
 *
 * Stores sidebar lists + per-feed view modes as a NIP-44-encrypted
 * addressable event (kind 30078, d-tag "mixstr-config-v1").
 *
 * Encryption is to-self: nip44.encrypt(userPubkey, plaintext).
 * This means only the owner's private key can decrypt it.
 *
 * Sync strategy:
 *  - On login / mount: fetch latest event, decrypt, merge with localStorage
 *    (Nostr wins if its timestamp is newer).
 *  - On any list change: debounce 3 s then publish updated event.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import type { SidebarList } from '@/lib/sidebarLists';
import type { FeedViewMode } from '@/contexts/MixstrContext';
import type { SpamSettings } from '@/lib/spam';

const D_TAG = 'mixstr-config-v1';
const LOCAL_OWNER_PUBKEY_KEY = 'mixstr:owner-pubkey';

export interface MixstrConfig {
  ownerPubkey: string;
  sidebarLists: SidebarList[];
  feedViewModes: Record<string, FeedViewMode>;
  spamSettings: SpamSettings;
  lastNotificationReadAt: number;
  savedAt: number;
}

/** Get the local ownerPubkey for the current account */
export function getLocalOwnerPubkey(pubkey?: string): string | null {
  if (!pubkey) return null;
  try {
    const key = `mixstr:owner-pubkey:${pubkey}`;
    return localStorage.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Set the local ownerPubkey for the current account */
export function setLocalOwnerPubkey(pubkey: string, ownerPubkey: string): void {
  try {
    const key = `mixstr:owner-pubkey:${pubkey}`;
    localStorage.setItem(key, ownerPubkey);
  } catch {
    // ignore storage errors
  }
}

/** Clear the local ownerPubkey for the current account */
export function clearLocalOwnerPubkey(pubkey: string): void {
  try {
    const key = `mixstr:owner-pubkey:${pubkey}`;
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

export interface MixstrRemoteConfigResult {
  config: MixstrConfig | null;
  ownerPubkeyMismatch: boolean;
  remoteOwnerPubkey: string | null;
}

/** Fetch + decrypt the remote config from Nostr */
export function useMixstrRemoteConfig(options?: { forceFresh?: boolean }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<MixstrRemoteConfigResult>({
    queryKey: ['nostr', 'mixstr-config', user?.pubkey ?? '', options?.forceFresh ? 'fresh' : 'cached'],
    queryFn: async ({ signal }) => {
      if (!user) return { config: null, ownerPubkeyMismatch: false, remoteOwnerPubkey: null };

      // Query all relays to get the newest event (not just the first relay that responds)
      const events = await nostr.query(
        [{ kinds: [30078], authors: [user.pubkey], '#d': [D_TAG], limit: 5 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );

      // Get the newest event by created_at timestamp
      const newestEvent = events.length > 0 
        ? events.reduce((newest, current) => 
            current.created_at > newest.created_at ? current : newest
          )
        : null;

      if (!newestEvent?.content) return { config: null, ownerPubkeyMismatch: false, remoteOwnerPubkey: null };
      if (!user.signer.nip44) return { config: null, ownerPubkeyMismatch: false, remoteOwnerPubkey: null };

      try {
        const plaintext = await user.signer.nip44.decrypt(user.pubkey, newestEvent.content);
        const parsed = JSON.parse(plaintext) as MixstrConfig;
        const ownerPubkeyMismatch = parsed.ownerPubkey && parsed.ownerPubkey !== user.pubkey;
        return {
          config: parsed,
          ownerPubkeyMismatch,
          remoteOwnerPubkey: parsed.ownerPubkey ?? null,
        };
      } catch {
        return { config: null, ownerPubkeyMismatch: false, remoteOwnerPubkey: null };
      }
    },
    enabled: !!user?.pubkey,
    staleTime: options?.forceFresh ? 0 : 10 * 1000, // Force fresh fetch or use 10s cache
    refetchInterval: options?.forceFresh ? false : 10 * 1000, // Poll every 10 seconds unless force fresh
    refetchOnWindowFocus: true, // Refetch when window is focused
    retry: 1,
  });
}

/** Publish an updated config to Nostr (encrypted to self) */
export function useSaveMixstrConfig() {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();

  return useMutation({
    mutationFn: async (config: MixstrConfig) => {
      if (!user) throw new Error('Not logged in');
      if (!user.signer.nip44) throw new Error('Signer does not support NIP-44');

      // Ensure ownerPubkey is set to current user
      const configWithOwner = {
        ...config,
        ownerPubkey: user.pubkey,
      };

      const plaintext = JSON.stringify(configWithOwner);
      const ciphertext = await user.signer.nip44.encrypt(user.pubkey, plaintext);

      await publish({
        kind: 30078,
        content: ciphertext,
        tags: [
          ['d', D_TAG],
          ['alt', 'Mixstr app configuration (encrypted)'],
        ],
      });
    },
  });
}

export interface PubkeyMismatchInfo {
  isMismatch: boolean;
  remoteOwnerPubkey: string | null;
  localPubkey: string | null;
}

/**
 * Full sync hook — call once in MixstrProvider.
 * Returns { isSyncing, lastSynced, syncError, pubkeyMismatchInfo }.
 *
 * Sync strategy:
 * 1. Check local ownerPubkey for the current user
 * 2. If local ownerPubkey is missing:
 *    - Fetch remote config
 *    - If remote exists, load it and set local ownerPubkey to remote's owner
 *    - If remote doesn't exist, set local ownerPubkey to current user's pubkey
 * 3. If local ownerPubkey exists but doesn't match current user:
 *    - Don't save to remote (settings belong to another account)
 *    - Report mismatch
 * 4. If local ownerPubkey matches current user:
 *    - Normal sync behavior (fetch remote, save to remote on changes)
 *
 * Consumers should call `scheduleBackup(config)` whenever
 * lists or view modes change.
 */
export function useMixstrSync({
  sidebarLists,
  feedViewModes,
  spamSettings,
  lastNotificationReadAt,
  onRemoteLoaded,
  onPubkeyMismatch,
}: {
  sidebarLists: SidebarList[];
  feedViewModes: Record<string, FeedViewMode>;
  spamSettings: SpamSettings;
  lastNotificationReadAt: number;
  onRemoteLoaded: (config: MixstrConfig) => void;
  onPubkeyMismatch: (mismatchInfo: PubkeyMismatchInfo) => void;
}) {
  const { user } = useCurrentUser();
  const forceFreshRef = useRef(false);
  const { data: remoteData, status: fetchStatus, refetch } = useMixstrRemoteConfig({ forceFresh: forceFreshRef.current });
  const { mutateAsync: save, isPending: isSaving, error: saveError } = useSaveMixstrConfig();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitializedSync = useRef(false);
  const hasReportedMismatch = useRef(false);
  const queryClient = useQueryClient();

  const remoteConfig = remoteData?.config ?? null;
  const remoteOwnerPubkeyMismatch = remoteData?.ownerPubkeyMismatch ?? false;
  const remoteOwnerPubkey = remoteData?.remoteOwnerPubkey ?? null;

  // Get local ownerPubkey for current user
  const localOwnerPubkey = user?.pubkey ? getLocalOwnerPubkey(user.pubkey) : null;

  // Reset flags when user changes so we re-initialize sync for the new account
  useEffect(() => {
    hasInitializedSync.current = false;
    hasReportedMismatch.current = false;
    forceFreshRef.current = true; // Force fresh fetch on next render
    // When the user changes (login / logout / switch) immediately invalidate
    // the query so the new account's config is fetched fresh.
    queryClient.invalidateQueries({ queryKey: ['nostr', 'mixstr-config'] });
    // Force a fresh fetch from all relays
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey]);

  // Initialize sync: handle local ownerPubkey logic
  // Wait for the remote query to complete before initializing
  useEffect(() => {
    if (!user?.pubkey || hasInitializedSync.current) return;
    if (fetchStatus === 'pending') return; // Wait for query to complete
    
    hasInitializedSync.current = true;
    forceFreshRef.current = false; // Reset the force fresh flag

    // Case 1: Local ownerPubkey is missing - need to initialize it
    if (!localOwnerPubkey) {
      // Check if remote config exists
      if (remoteConfig && remoteOwnerPubkey) {
        // Remote exists: load it and set local ownerPubkey to remote's owner
        setLocalOwnerPubkey(user.pubkey, remoteOwnerPubkey);
        
        // If remote owner doesn't match current user, report mismatch
        if (remoteOwnerPubkey !== user.pubkey) {
          const mismatchInfo: PubkeyMismatchInfo = {
            isMismatch: true,
            remoteOwnerPubkey,
            localPubkey: user.pubkey,
          };
          hasReportedMismatch.current = true;
          onPubkeyMismatch(mismatchInfo);
        } else {
          // Remote owner matches current user, load the config
          onRemoteLoaded(remoteConfig);
        }
      } else {
        // Remote doesn't exist: set local ownerPubkey to current user
        setLocalOwnerPubkey(user.pubkey, user.pubkey);
        // No remote config to load, use local defaults
      }
      return;
    }

    // Case 2: Local ownerPubkey exists but doesn't match current user
    if (localOwnerPubkey !== user.pubkey) {
      // Settings belong to another account - don't save to remote
      const mismatchInfo: PubkeyMismatchInfo = {
        isMismatch: true,
        remoteOwnerPubkey: localOwnerPubkey,
        localPubkey: user.pubkey,
      };
      hasReportedMismatch.current = true;
      onPubkeyMismatch(mismatchInfo);
      return;
    }

    // Case 3: Local ownerPubkey matches current user - normal sync
    // If remote config exists and is from the same owner, load it
    if (remoteConfig && remoteOwnerPubkey === user.pubkey) {
      onRemoteLoaded(remoteConfig);
    }
  }, [user?.pubkey, localOwnerPubkey, remoteConfig, remoteOwnerPubkey, fetchStatus, onRemoteLoaded, onPubkeyMismatch]);

  // Continuously check for remote changes while in sync (local ownerPubkey matches user)
  useEffect(() => {
    if (!user?.pubkey || !localOwnerPubkey || localOwnerPubkey !== user.pubkey) return;
    if (!remoteConfig || hasInitializedSync.current === false) return;

    // Remote config exists and local owner matches user - load it
    onRemoteLoaded(remoteConfig);
  }, [remoteConfig, user?.pubkey, localOwnerPubkey, onRemoteLoaded]);

  const scheduleBackup = useCallback(() => {
    if (!user) return;
    
    // Get current local ownerPubkey
    const currentLocalOwner = getLocalOwnerPubkey(user.pubkey);
    
    // Don't save to remote if local ownerPubkey doesn't match current user
    if (currentLocalOwner && currentLocalOwner !== user.pubkey) {
      return;
    }
    
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const config: MixstrConfig = {
        ownerPubkey: user.pubkey,
        sidebarLists,
        feedViewModes,
        spamSettings,
        lastNotificationReadAt,
        savedAt: Math.floor(Date.now() / 1000),
      };
      try {
        await save(config);
        // Invalidate so a re-fetch would get the new event
        queryClient.invalidateQueries({
          queryKey: ['nostr', 'mixstr-config', user.pubkey],
        });
      } catch {
        // Silent — backup is best-effort
      }
    }, 3000);
  }, [user, sidebarLists, feedViewModes, spamSettings, lastNotificationReadAt, save, queryClient]);

  return {
    isSyncing: fetchStatus === 'pending' || isSaving,
    syncError: saveError,
    scheduleBackup,
    pubkeyMismatchInfo: {
      isMismatch: localOwnerPubkey ? localOwnerPubkey !== user?.pubkey : false,
      remoteOwnerPubkey: localOwnerPubkey ?? remoteOwnerPubkey,
      localPubkey: user?.pubkey ?? null,
    },
  };
}
