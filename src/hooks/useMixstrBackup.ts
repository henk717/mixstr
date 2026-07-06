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

export interface MixstrConfig {
  ownerPubkey: string;
  sidebarLists: SidebarList[];
  feedViewModes: Record<string, FeedViewMode>;
  spamSettings: SpamSettings;
  lastNotificationReadAt: number;
  savedAt: number;
}

export interface MixstrRemoteConfigResult {
  config: MixstrConfig | null;
  ownerPubkeyMismatch: boolean;
  remoteOwnerPubkey: string | null;
}

/** Fetch + decrypt the remote config from Nostr */
export function useMixstrRemoteConfig() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<MixstrRemoteConfigResult>({
    queryKey: ['nostr', 'mixstr-config', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return { config: null, ownerPubkeyMismatch: false, remoteOwnerPubkey: null };

      const [event] = await nostr.query(
        [{ kinds: [30078], authors: [user.pubkey], '#d': [D_TAG], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );

      if (!event?.content) return { config: null, ownerPubkeyMismatch: false, remoteOwnerPubkey: null };
      if (!user.signer.nip44) return { config: null, ownerPubkeyMismatch: false, remoteOwnerPubkey: null };

      try {
        const plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content);
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
    staleTime: 5 * 60 * 1000,
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
  const { data: remoteData, status: fetchStatus } = useMixstrRemoteConfig();
  const { mutateAsync: save, isPending: isSaving, error: saveError } = useSaveMixstrConfig();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRemote = useRef(false);
  const hasReportedMismatch = useRef(false);
  const queryClient = useQueryClient();

  const remoteConfig = remoteData?.config ?? null;
  const ownerPubkeyMismatch = remoteData?.ownerPubkeyMismatch ?? false;
  const remoteOwnerPubkey = remoteData?.remoteOwnerPubkey ?? null;

  // Reset flags when user changes so we re-apply the remote config
  // for the newly active account.
  useEffect(() => {
    hasLoadedRemote.current = false;
    hasReportedMismatch.current = false;
    // When the user changes (login / logout / switch) immediately invalidate
    // the query so the new account's config is fetched fresh.
    queryClient.invalidateQueries({ queryKey: ['nostr', 'mixstr-config'] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey]);

  // On first successful remote fetch (per account), handle pubkey mismatch or merge remote → local
  useEffect(() => {
    if (!remoteConfig || hasLoadedRemote.current) return;
    
    hasLoadedRemote.current = true;

    // Check for pubkey mismatch
    if (ownerPubkeyMismatch && remoteOwnerPubkey && user?.pubkey) {
      const mismatchInfo: PubkeyMismatchInfo = {
        isMismatch: true,
        remoteOwnerPubkey,
        localPubkey: user.pubkey,
      };
      hasReportedMismatch.current = true;
      onPubkeyMismatch(mismatchInfo);
      return;
    }

    // No mismatch, load remote config normally
    onRemoteLoaded(remoteConfig);
  }, [remoteConfig, ownerPubkeyMismatch, remoteOwnerPubkey, onRemoteLoaded, onPubkeyMismatch, user?.pubkey]);

  const scheduleBackup = useCallback(() => {
    if (!user) return;
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
      isMismatch: ownerPubkeyMismatch,
      remoteOwnerPubkey,
      localPubkey: user?.pubkey ?? null,
    },
  };
}
