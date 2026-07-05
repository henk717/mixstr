import { nip19 } from 'nostr-tools';
import type { FollowingProfile } from '@/hooks/useFollowingProfiles';

const NOSTR_NPUB_REGEX = /nostr:(npub1[ac-hj-np-z02-9]+)/g;
const HASHTAG_REGEX = /(?:^|\s)#(\w+)/g;

/** Encode a hex pubkey to a NIP-27 `nostr:npub1…` reference. */
export function encodeNpub(pubkey: string): string {
  return `nostr:${nip19.npubEncode(pubkey)}`;
}

/** Human-readable label for a profile, preferring display_name. */
export function profileLabel(p: FollowingProfile): string {
  return p.displayName?.trim() || p.name?.trim() || p.nip05?.trim() || `${p.pubkey.slice(0, 8)}…`;
}

/** Extract p-tag mentions and t-tag hashtags from free-form content. */
export function extractContentTags(content: string): string[][] {
  const tags: string[][] = [];
  const seenP = new Set<string>();
  const seenT = new Set<string>();

  for (const match of content.matchAll(NOSTR_NPUB_REGEX)) {
    try {
      const decoded = nip19.decode(match[1]);
      if (decoded.type !== 'npub') continue;
      const pubkey = decoded.data as string;
      if (seenP.has(pubkey)) continue;
      seenP.add(pubkey);
      tags.push(['p', pubkey, '']);
    } catch {
      // ignore invalid bech32
    }
  }

  for (const match of content.matchAll(HASHTAG_REGEX)) {
    const tag = match[1].toLowerCase();
    if (seenT.has(tag)) continue;
    seenT.add(tag);
    tags.push(['t', tag]);
  }

  return tags;
}
