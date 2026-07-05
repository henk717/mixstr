import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
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

/**
 * Fetches reaction stats (replies, reposts, likes, zaps) for a given event.
 */
export function usePostReactions(eventId: string, myPubkey?: string): PostReactions {
  const { nostr } = useNostr();

  const { data, isLoading } = useQuery({
    queryKey: ['nostr', 'post-reactions', eventId],
    queryFn: async ({ signal }) => {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(6000)]);

      // Fetch replies, reposts, reactions, and zaps in one combined query
      const events = await nostr.query(
        [{ kinds: [1, 6, 7, 9735], '#e': [eventId], limit: 500 }],
        { signal: abort },
      );

      const replies = events.filter((e) => e.kind === 1);
      const reposts = events.filter((e) => e.kind === 6);
      const reactions = events.filter((e) => e.kind === 7);
      const zaps = events.filter((e) => e.kind === 9735);

      // Count zap amounts from bolt11 tags in zap receipts
      let zapsMsats = 0;
      for (const zap of zaps) {
        const bolt11 = zap.tags.find(([t]) => t === 'bolt11')?.[1];
        if (bolt11) {
          // Extract amount from BOLT11 invoice
          const msats = extractMsatsFromBolt11(bolt11);
          zapsMsats += msats;
        }
        // Fallback: try amount tag
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

        const key = resolved.url ? resolved.name ?? resolved.content : resolved.content;
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

      const reactionSummary: ReactionSummary = {
        count: reactions.length,
        breakdown,
        topEmoji,
        hasReacted,
      };

      return {
        replies: replies.length,
        reposts: reposts.length,
        reactions: reactionSummary,
        zapsMsats,
      };
    },
    staleTime: 60 * 1000,
    enabled: !!eventId,
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
    // Match lnbc/lntb/lnbcrt prefix + amount + multiplier
    const match = bolt11.toLowerCase().match(/^ln(?:bc|tb|bcrt|tbs)(\d+)([munp]?)1/);
    if (!match) return 0;
    const amount = parseInt(match[1], 10);
    const multiplier = match[2];

    // Convert to msats
    const BTC_TO_MSAT = 100_000_000_000;
    switch (multiplier) {
      case 'm': return Math.round(amount * BTC_TO_MSAT * 0.001);
      case 'u': return Math.round(amount * BTC_TO_MSAT * 0.000001);
      case 'n': return Math.round(amount * BTC_TO_MSAT * 0.000000001);
      case 'p': return Math.round(amount * BTC_TO_MSAT * 0.000000000001);
      case '':  return amount * BTC_TO_MSAT; // whole BTC (rare)
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
  if (sats >= 1_000) return `${Math.floor(sats / 1000)}k`;
  return String(sats);
}
