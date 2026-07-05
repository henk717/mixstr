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
  sidebarLists: SidebarList[];
  feedViewModes: Record<string, FeedViewMode>;
  spamSettings: SpamSettings;
  savedAt: number;
}

/** Fetch + decrypt the remote config from Nostr */
export function useMixstrRemoteConfig() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<MixstrConfig | null>({
    queryKey: ['nostr', 'mixstr-config', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return null;

      const [event] = await nostr.query(
        [{ kinds: [30078], authors: [user.pubkey], '#d': [D_TAG], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );

      if (!event?.content) return null;
      if (!user.signer.nip44) return null;

      try {
        const plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content);
        const parsed = JSON.parse(plaintext) as MixstrConfig;
        return parsed;
      } catch {
        return null;
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

      const plaintext = JSON.stringify(config);
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

/**
 * Full sync hook — call once in MixstrProvider.
 * Returns { isSyncing, lastSynced, syncError }.
 *
 * Consumers should call `scheduleBackup(config)` whenever
 * lists or view modes change.
 */
export function useMixstrSync({
  sidebarLists,
  feedViewModes,
  spamSettings,
  onRemoteLoaded,
}: {
  sidebarLists: SidebarList[];
  feedViewModes: Record<string, FeedViewMode>;
  spamSettings: SpamSettings;
  onRemoteLoaded: (config: MixstrConfig) => void;
}) {
  const { user } = useCurrentUser();
  const { data: remoteConfig, status: fetchStatus } = useMixstrRemoteConfig();
  const { mutateAsync: save, isPending: isSaving, error: saveError } = useSaveMixstrConfig();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRemote = useRef(false);
  const queryClient = useQueryClient();

  // Reset merge-flag when user changes so we re-apply the remote config
  // for the newly active account.
  useEffect(() => {
    hasLoadedRemote.current = false;
    // When the user changes (login / logout / switch) immediately invalidate
    // the query so the new account's config is fetched fresh.
    queryClient.invalidateQueries({ queryKey: ['nostr', 'mixstr-config'] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey]);

  // On first successful remote fetch (per account), merge remote → local if remote is newer
  useEffect(() => {
    if (!remoteConfig || hasLoadedRemote.current) return;
    hasLoadedRemote.current = true;
    onRemoteLoaded(remoteConfig);
  }, [remoteConfig, onRemoteLoaded]);

  const scheduleBackup = useCallback(() => {
    if (!user) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const config: MixstrConfig = {
        sidebarLists,
        feedViewModes,
        spamSettings,
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
  }, [user, sidebarLists, feedViewModes, spamSettings, save, queryClient]);

  return {
    isSyncing: fetchStatus === 'pending' || isSaving,
    syncError: saveError,
    scheduleBackup,
  };
}
