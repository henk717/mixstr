import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { resolveReactionEmoji } from '@/lib/customEmoji';

export interface ReactionSummary {
  /** Total reaction count (all kinds of likes) */
  count: number;
  /** Emoji breakdown: emoji string → count */
  breakdown: Map<string, { count: number; imageUrl?: string }>;
  /** Top emoji by count */
  topEmoji: string;
  /** Whether the current user has already reacted */
  hasReacted: boolean;
}

export interface PostReactions {
  replies: number;
  reposts: number;
  reactions: ReactionSummary;
  /** Total zap amount in millisats */
  zapsMsats: number;
  isLoading: boolean;
}

function uniqueEvents(batches: NostrEvent[][]): NostrEvent[] {
  const seen = new Set<string>();
  const out: NostrEvent[] = [];
  for (const batch of batches) {
    for (const ev of batch) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        out.push(ev);
      }
    }
  }
  return out;
}

/**
 * Fetches reaction stats (replies, reposts, likes, zaps) for a given event.
 *
 * Queries every configured read relay in parallel and merges the results so
 * the counts are complete and not blocked by a single slow relay or the pool's
 * default convergence behaviour.
 */
export function usePostReactions(eventId: string, myPubkey?: string, enabled = true): PostReactions {
  const { nostr } = useNostr();
  const { config } = useAppContext();

  const readRelays = useMemo(
    () => config.relayMetadata.relays.filter((r) => r.read).map((r) => r.url),
    [config.relayMetadata.relays],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['nostr', 'post-reactions', eventId, readRelays],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
      const filter = { kinds: [1, 6, 7, 9735] as const, '#e': [eventId], limit: 250 };

      let events: NostrEvent[];
      if (readRelays.length === 0) {
        events = await nostr.query([filter], { signal: abort });
      } else {
        const settled = await Promise.allSettled(
          readRelays.map(async (url) => {
            try {
              const relay = nostr.relay(url);
              return await relay.query([filter], { signal: abort });
            } catch {
              return [];
            }
          }),
        );
        events = uniqueEvents(
          settled
            .filter((r): r is PromiseFulfilledResult<NostrEvent[]> => r.status === 'fulfilled')
            .map((r) => r.value),
        );
      }

      const replies = events.filter((e) => e.kind === 1);
      const reposts = events.filter((e) => e.kind === 6);
      const reactions = events.filter((e) => e.kind === 7);
      const zaps = events.filter((e) => e.kind === 9735);

      // Count zap amounts from bolt11 tags in zap receipts
      let zapsMsats = 0;
      for (const zap of zaps) {
        const bolt11 = zap.tags.find(([t]) => t === 'bolt11')?.[1];
        if (bolt11) {
          const msats = extractMsatsFromBolt11(bolt11);
          zapsMsats += msats;
        }
        const amountTag = zap.tags.find(([t]) => t === 'amount')?.[1];
        if (!bolt11 && amountTag) {
          zapsMsats += parseInt(amountTag, 10) || 0;
        }
      }

      // Tally reactions
      const breakdown = new Map<string, { count: number; imageUrl?: string }>();
      let hasReacted = false;

      for (const reaction of reactions) {
        const resolved = resolveReactionEmoji(reaction);
        if (!resolved) continue;

        const display = resolved.content;
        const existing = breakdown.get(display) ?? { count: 0, imageUrl: resolved.url };
        existing.count += 1;
        breakdown.set(display, existing);

        if (myPubkey && reaction.pubkey === myPubkey) {
          hasReacted = true;
        }
      }

      // Find top emoji
      let topEmoji = '👍';
      let topCount = 0;
      for (const [emoji, info] of breakdown) {
        if (info.count > topCount) {
          topCount = info.count;
          topEmoji = emoji;
        }
      }

      return {
        replies: replies.length,
        reposts: reposts.length,
        reactions: {
          count: reactions.length,
          breakdown,
          topEmoji,
          hasReacted,
        },
        zapsMsats,
      };
    },
    staleTime: 60 * 1000,
    enabled: enabled && !!eventId,
  });

  return {
    replies: data?.replies ?? 0,
    reposts: data?.reposts ?? 0,
    reactions: data?.reactions ?? { count: 0, breakdown: new Map(), topEmoji: '👍', hasReacted: false },
    zapsMsats: data?.zapsMsats ?? 0,
    isLoading,
  };
}

/**
 * Roughly extracts millisatoshi amount from a BOLT11 invoice string.
 * BOLT11 encodes amount in the human-readable part: lnbc<amount><multiplier>
 * Multipliers: m=milli(0.001), u=micro(0.000001), n=nano(0.000000001), p=pico(0.000000000001)
 * Amount in BTC → convert to msats (1 BTC = 100_000_000_000 msats)
 */
function extractMsatsFromBolt11(bolt11: string): number {
  try {
    const match = bolt11.toLowerCase().match(/^ln(?:bc|tb|bcrt|tbs)(\d+)([munp]?)1/);
    if (!match) return 0;
    const amount = parseInt(match[1], 10);
    const multiplier = match[2];

    const BTC_TO_MSAT = 100_000_000_000;
    switch (multiplier) {
      case 'm': return Math.round(amount * BTC_TO_MSAT * 0.001);
      case 'u': return Math.round(amount * BTC_TO_MSAT * 0.000001);
      case 'n': return Math.round(amount * BTC_TO_MSAT * 0.000000001);
      case 'p': return Math.round(amount * BTC_TO_MSAT * 0.000000000001);
      case '':  return amount * BTC_TO_MSAT;
      default:  return 0;
    }
  } catch {
    return 0;
  }
}

/** Format millisatoshi amount to a human-readable string */
export function formatZapAmount(msats: number): string {
  const sats = Math.floor(msats / 1000);
  if (sats === 0) return '';
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${Math.floor(sats / 1_000)}k`;
  return String(sats);
}
