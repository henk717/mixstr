import type { NostrEvent } from '@nostrify/nostrify';
import type { RssItem } from '@/hooks/useRssFeed';
import { stableHex64 } from './stableId';

/**
 * Deterministic 64-character hex string that is *not* a real secp256k1 pubkey.
 * Items from the same feed share a pubkey so author queries are minimised,
 * while still passing truthy pubkey checks in spam filters.
 */
function fakePubkeyForRss(feedUrl: string): string {
  return stableHex64(`rss-pubkey:${feedUrl}`);
}

/**
 * Convert an RSS/Atom item into a synthetic Nostr event so the existing
 * card stack (ShortPostCard, LongPostCard, MediaCard, AudioCard) can render
 * YouTube/podcast feeds without dedicated RSS branches everywhere.
 *
 * The synthetic event is kind 1 with:
 * - `content` containing the article link and enclosure URL so
 *   extractVideos / extractAudio / extractExternalEmbeds work.
 * - `title` and `image` tags so getEventTitle / getCoverImage work.
 * - `url` / `imeta` so getAudioTrackInfo / getMediaDuration work.
 * - `rss` / `feedTitle` / `link` tags so the UI can mark the source and link out.
 */
export function rssItemToSyntheticEvent(item: RssItem): NostrEvent {
  const parts: string[] = [item.title, item.description, item.link];
  const tags: string[][] = [
    ['rss'],
    ['title', item.title],
    ['feedTitle', item.feedTitle],
    ['link', item.link],
    ['client', 'mixstr'],
    ['alt', `RSS item from ${item.feedTitle}: ${item.title}`],
  ];

  if (item.image) {
    tags.push(['image', item.image]);
  }

  if (item.enclosure?.url) {
    tags.push(['url', item.enclosure.url]);
    const imeta = ['imeta', `url ${item.enclosure.url}`];
    if (item.enclosure.type) {
      imeta.push(`m ${item.enclosure.type}`);
    }
    if (item.enclosure.length && item.enclosure.length > 0) {
      imeta.push(`size ${item.enclosure.length}`);
    }
    tags.push(imeta);
    parts.push(item.enclosure.url);
  }

  if (item.durationSec && item.durationSec > 0) {
    tags.push(['duration', String(item.durationSec)]);
  }

  const content = parts.filter(Boolean).join('\n\n');
  const id = stableHex64(`rss:${item.id}`);
  const pubkey = fakePubkeyForRss(item.feedUrl);

  return {
    id,
    pubkey,
    created_at: item.pubDate,
    kind: 1,
    tags,
    content,
    sig: '',
  };
}

/**
 * Compact multiple RSS items, removing synthetic duplicates.
 */
export function rssItemsToSyntheticEvents(items: RssItem[]): NostrEvent[] {
  const seen = new Set<string>();
  const out: NostrEvent[] = [];
  for (const item of items) {
    const ev = rssItemToSyntheticEvent(item);
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    out.push(ev);
  }
  return out;
}

/** Identify an event produced by rssItemToSyntheticEvent. */
export function isRssSyntheticEvent(event: NostrEvent): boolean {
  return event.tags.some(([k]) => k === 'rss');
}

/** Return RSS metadata embedded in a synthetic event. */
export function getRssItemInfo(event: NostrEvent): { feedTitle: string; link: string } | null {
  if (!isRssSyntheticEvent(event)) return null;
  return {
    feedTitle: event.tags.find(([k]) => k === 'feedTitle')?.[1] ?? 'RSS Feed',
    link: event.tags.find(([k]) => k === 'link')?.[1] ?? '',
  };
}
