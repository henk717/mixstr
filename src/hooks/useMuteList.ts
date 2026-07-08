import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { useFollowing } from './useFollowing';
import { useMixstr } from './useMixstr';
import {
  countHashtags,
  isNonHumanReadable,
  isReadabilityExempt,
  type SpamSettings,
} from '@/lib/spam';
import type { NostrEvent } from '@nostrify/nostrify';

export interface MuteList {
  /** Muted pubkeys (hex) */
  pubkeys: Set<string>;
  /** Muted keywords (lowercased) */
  keywords: string[];
  /** Muted hashtags from other clients' `t` tags (lowercased, without #) */
  hashtags: string[];
  /** Muted list addresses ("kind:pubkey:d-tag") — expanded to pubkeys separately */
  lists: string[];
}

async function decryptPrivateTags(
  user: NonNullable<ReturnType<typeof useCurrentUser>['user']>,
  ciphertext: string,
): Promise<string[][]> {
  if (!ciphertext.trim()) return [];
  if (!user.signer.nip44) return [];
  try {
    const plaintext = await user.signer.nip44.decrypt(user.pubkey, ciphertext);
    const parsed = JSON.parse(plaintext) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => Array.isArray(item))) {
      return parsed as string[][];
    }
  } catch {
    // ignore decryption/parse failures
  }
  return [];
}

async function parseMuteEvent(
  event: NostrEvent | undefined,
  user?: ReturnType<typeof useCurrentUser>['user'],
): Promise<MuteList> {
  if (!event) return { pubkeys: new Set(), keywords: [], hashtags: [], lists: [] };

  const publicTags = event.tags;
  const privateTags = user ? await decryptPrivateTags(user, event.content) : [];
  const allTags = [...publicTags, ...privateTags];

  const keywords = allTags
    .filter(([t]) => t === 'word')
    .map(([, v]) => v.toLowerCase())
    .filter(Boolean);
  const hashtags = Array.from(
    new Set(
      allTags
        .filter(([t]) => t === 't')
        .map(([, v]) => v.toLowerCase())
        .filter(Boolean),
    ),
  );
  return {
    pubkeys: new Set(
      allTags.filter(([t]) => t === 'p').map(([, v]) => v).filter(Boolean),
    ),
    keywords,
    hashtags,
    lists: allTags.filter(([t]) => t === 'a').map(([, v]) => v).filter(Boolean),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

interface TrustMetrics {
  reportCounts: Map<string, number>;
  followCounts: Map<string, number>;
}

/**
 * Returns the current user's NIP-51 mute list (kind 10000) combined with any
 * subscribed blocklists, plus automatic spam-detection filters configured in
 * the block settings screen.
 */
export function useMuteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followingHex = [] } = useFollowing();
  const { spamSettings } = useMixstr();

  const {
    data: muted = { pubkeys: new Set<string>(), keywords: [], hashtags: [], lists: [] },
    isLoading: isMuteListLoading,
  } = useQuery<MuteList>({
    queryKey: ['nostr', 'mute-list', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return { pubkeys: new Set(), keywords: [], hashtags: [], lists: [] };
      const [ev] = await nostr.query(
        [{ kinds: [10000], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return parseMuteEvent(ev ?? undefined, user);
    },
    enabled: !!user?.pubkey,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Fetch people from subscribed blocklists
  const {
    data: blockListPubkeys = new Set<string>(),
    isLoading: isBlockListLoading,
  } = useQuery<Set<string>>({
    queryKey: ['nostr', 'block-list-people', muted.lists.join(',')],
    queryFn: async ({ signal }) => {
      if (!muted.lists.length) return new Set<string>();
      const filters = muted.lists
        .map((addr) => {
          const parts = addr.split(':');
          if (parts.length < 2) return null;
          const kind = parseInt(parts[0], 10);
          const pubkey = parts[1];
          const identifier = parts.slice(2).join(':');
          if (Number.isNaN(kind) || !pubkey) return null;
          return { kinds: [kind], authors: [pubkey], '#d': [identifier], limit: 1 };
        })
        .filter(Boolean) as { kinds: number[]; authors: string[]; '#d': string[]; limit: number }[];

      if (!filters.length) return new Set<string>();

      const results = await nostr.query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });

      const blocked = new Set<string>();
      for (const ev of results) {
        for (const tag of ev.tags) {
          if (tag[0] === 'p' && tag[1]) blocked.add(tag[1]);
        }
      }
      return blocked;
    },
    enabled: muted.lists.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Web-of-trust metrics: count reports and follows from people in my network.
  const { data: trustMetrics } = useQuery<TrustMetrics>({
    queryKey: [
      'nostr',
      'trust-metrics',
      user?.pubkey ?? '',
      followingHex.length,
      followingHex[0] ?? '',
      spamSettings.webOfTrust.windowDays,
    ],
    queryFn: async ({ signal }) => {
      const since =
        Math.floor(Date.now() / 1000) - spamSettings.webOfTrust.windowDays * 24 * 60 * 60;
      const chunks = chunk(followingHex, 200);

      const followFilters = chunks.map((authors) => ({
        kinds: [3] as number[],
        authors,
        limit: authors.length,
      }));
      const reportFilters = chunks.map((authors) => ({
        kinds: [1984] as number[],
        authors,
        since,
        limit: 1000,
      }));

      const [followEvents, reportEvents] = await Promise.all([
        nostr.query(followFilters, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        }),
        nostr.query(reportFilters, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        }),
      ]);

      const reportCounts = new Map<string, number>();
      const followCounts = new Map<string, number>();

      for (const ev of reportEvents) {
        for (const tag of ev.tags) {
          if (tag[0] === 'p' && tag[1]) {
            reportCounts.set(tag[1], (reportCounts.get(tag[1]) ?? 0) + 1);
          }
        }
      }

      for (const ev of followEvents) {
        for (const tag of ev.tags) {
          if (tag[0] === 'p' && tag[1]) {
            followCounts.set(tag[1], (followCounts.get(tag[1]) ?? 0) + 1);
          }
        }
      }

      return { reportCounts, followCounts };
    },
    enabled: !!user?.pubkey && spamSettings.webOfTrust.enabled && followingHex.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  /** Returns true if the event should be hidden */
  const isMuted = useCallback(
    (event: NostrEvent, speedIndex?: Map<string, number>): boolean => {
      if (!event?.pubkey) return true;
      if (user?.pubkey === event.pubkey) return false;

      // Explicitly muted author
      if (muted.pubkeys.has(event.pubkey)) return true;
      if (blockListPubkeys.has(event.pubkey)) return true;

      // Muted keyword / hashtag in content
      const blockedTerms = muted.keywords.concat(muted.hashtags);
      if (blockedTerms.length > 0) {
        const contentLower = event.content.toLowerCase();
        if (blockedTerms.some((kw) => contentLower.includes(kw))) return true;
      }

      // Muted hashtag via `t` tags (used by some other clients)
      if (muted.hashtags.length > 0) {
        for (const tag of event.tags) {
          if (tag[0] === 't' && tag[1] && muted.hashtags.includes(tag[1].toLowerCase())) {
            return true;
          }
        }
      }

      // Web of trust
      if (spamSettings.webOfTrust.enabled && trustMetrics) {
        const reports = trustMetrics.reportCounts.get(event.pubkey) ?? 0;
        const follows = trustMetrics.followCounts.get(event.pubkey) ?? 0;
        // Block if the author has more reports than follows from my network AND
        // is not followed by anyone in my network.
        if (follows === 0 && reports > follows) return true;
      }

      // Hashtag spam
      if (spamSettings.hashtag.enabled) {
        if (countHashtags(event) > spamSettings.hashtag.maxTags) return true;
      }

      // Inhuman posting speed
      if (spamSettings.speed.enabled && speedIndex) {
        const recent = speedIndex.get(event.pubkey) ?? 0;
        if (recent > spamSettings.speed.maxEvents) return true;
      }

      // Non-human-readable / JSON / base64 spam
      if (spamSettings.readability.enabled && !isReadabilityExempt(event)) {
        if (isNonHumanReadable(event.content, spamSettings.readability.minBase64Length)) {
          return true;
        }
      }

      return false;
    },
    [muted, blockListPubkeys, trustMetrics, spamSettings, user?.pubkey],
  );

  /** Returns true if any blocklist query is still loading */
  const isLoading = isMuteListLoading || isBlockListLoading;

  return { muted, blockListPubkeys, isMuted, isLoading };
}
