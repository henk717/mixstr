import type { NostrEvent } from '@nostrify/nostrify';

/** Extract image URLs from event content and tags */
export function extractImages(event: NostrEvent): string[] {
  const urls: string[] = [];

  // From imeta tags (NIP-94)
  for (const tag of event.tags) {
    if (tag[0] === 'imeta') {
      const urlEntry = tag.find((v) => v.startsWith('url '));
      if (urlEntry) urls.push(urlEntry.slice(4));
    }
  }

  // From content regex
  const imgRegex = /https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?\S*)?/gi;
  const matches = event.content.match(imgRegex) ?? [];
  for (const m of matches) {
    if (!urls.includes(m)) urls.push(m);
  }

  return urls;
}

/** Extract video URLs */
export function extractVideos(event: NostrEvent): string[] {
  const urls: string[] = [];

  for (const tag of event.tags) {
    if (tag[0] === 'imeta') {
      const urlEntry = tag.find((v) => v.startsWith('url '));
      if (urlEntry) {
        const u = urlEntry.slice(4);
        if (/\.(mp4|webm|mov|avi|mkv)/i.test(u)) urls.push(u);
      }
    }
    if (tag[0] === 'url' && /\.(mp4|webm|mov)/i.test(tag[1])) {
      urls.push(tag[1]);
    }
  }

  const vidRegex = /https?:\/\/\S+\.(?:mp4|webm|mov)(?:\?\S*)?/gi;
  const matches = event.content.match(vidRegex) ?? [];
  for (const m of matches) {
    if (!urls.includes(m)) urls.push(m);
  }

  return urls;
}

/** Extract audio URLs */
export function extractAudio(event: NostrEvent): string[] {
  const urls: string[] = [];

  for (const tag of event.tags) {
    if (tag[0] === 'imeta') {
      const urlEntry = tag.find((v) => v.startsWith('url '));
      if (urlEntry) {
        const u = urlEntry.slice(4);
        if (/\.(mp3|ogg|wav|flac|aac|opus|m4a)/i.test(u)) urls.push(u);
      }
    }
    if (tag[0] === 'url' && /\.(mp3|ogg|wav|flac|aac|opus|m4a)/i.test(tag[1])) {
      urls.push(tag[1]);
    }
  }

  const audioRegex = /https?:\/\/\S+\.(?:mp3|ogg|wav|flac|aac|opus|m4a)(?:\?\S*)?/gi;
  const matches = event.content.match(audioRegex) ?? [];
  for (const m of matches) {
    if (!urls.includes(m)) urls.push(m);
  }

  return urls;
}

/** Get event title from tags */
export function getEventTitle(event: NostrEvent): string | undefined {
  return (
    event.tags.find(([t]) => t === 'title')?.[1] ||
    event.tags.find(([t]) => t === 'subject')?.[1]
  );
}

/** Get cover image from event tags (used for long-form) */
export function getCoverImage(event: NostrEvent): string | undefined {
  return (
    event.tags.find(([t]) => t === 'image')?.[1] ||
    event.tags.find(([t]) => t === 'thumb')?.[1] ||
    extractImages(event)[0]
  );
}

/** Get summary / excerpt */
export function getSummary(event: NostrEvent): string | undefined {
  return event.tags.find(([t]) => t === 'summary')?.[1];
}

/** Strip media URLs from content for text-only display */
export function stripMediaUrls(content: string): string {
  return content
    .replace(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|avif|mp4|webm|mov|mp3|ogg|wav|flac|aac|opus|m4a)(?:\?\S*)?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Relative time formatting */
export function relativeTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(ts * 1000).toLocaleDateString();
}

/** Check if event is a reply (has 'e' tag with 'reply' or 'root' marker) */
export function isReply(event: NostrEvent): boolean {
  return event.tags.some(([t]) => t === 'e');
}

/** Check if event is a repost (kind 6) */
export function isRepost(event: NostrEvent): boolean {
  return event.kind === 6;
}

/** Check if kind is long-form article */
export function isLongform(event: NostrEvent): boolean {
  return event.kind === 30023;
}

/** Check if event has media */
export function hasMedia(event: NostrEvent): boolean {
  return extractImages(event).length > 0 || extractVideos(event).length > 0;
}

/** Check if event has audio */
export function hasAudio(event: NostrEvent): boolean {
  return extractAudio(event).length > 0 || event.kind === 31337;
}

/** Get track info from kind 31337 (audio) event */
export function getAudioTrackInfo(event: NostrEvent): { title: string; url: string; artist?: string; artwork?: string } | null {
  const title = getEventTitle(event) || 'Untitled Track';
  const url =
    event.tags.find(([t]) => t === 'streaming')?.[1] ||
    event.tags.find(([t]) => t === 'url')?.[1] ||
    extractAudio(event)[0];
  if (!url) return null;
  const artist = event.tags.find(([t]) => t === 'artist')?.[1];
  const artwork = getCoverImage(event);
  return { title, url, artist, artwork };
}
