import type { NostrEvent } from '@nostrify/nostrify';

/** Extract image URLs from event content and tags */
export function extractImages(event: NostrEvent): string[] {
  const urls: string[] = [];
  const imageExt = /\.(?:jpg|jpeg|png|gif|webp|avif)(?:[?#]\S*)?$/i;

  // From imeta tags (NIP-94) — respect the mimetype so audio enclosures don't
  // get misclassified as thumbnails.
  for (const tag of event.tags) {
    if (tag[0] === 'imeta') {
      const urlEntry = tag.find((v) => v.startsWith('url '));
      const mimeEntry = tag.find((v) => v.startsWith('m '));
      if (urlEntry) {
        const url = urlEntry.slice(4);
        const mime = mimeEntry?.slice(2).toLowerCase() ?? '';
        const looksLikeImage = mime.startsWith('image/') || (!mime && imageExt.test(url));
        if (looksLikeImage) urls.push(url);
      }
    }
  }

  // From content regex
  const imgRegex = /https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|avif)(?:[?#]\S*)?/gi;
  const matches = event.content.match(imgRegex) ?? [];
  for (const m of matches) {
    if (!urls.includes(m)) urls.push(m);
  }

  return urls;
}

/** Extract direct video file URLs */
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
    if (tag[0] === 'url' && /\.(mp4|webm|mov|avi|mkv)/i.test(tag[1])) {
      if (!urls.includes(tag[1])) urls.push(tag[1]);
    }
    // NIP-53 streaming tag
    if (tag[0] === 'streaming' && /\.(mp4|webm|mov)/i.test(tag[1])) {
      if (!urls.includes(tag[1])) urls.push(tag[1]);
    }
  }

  const vidRegex = /https?:\/\/\S+\.(?:mp4|webm|mov)(?:[?#]\S*)?/gi;
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
      if (!urls.includes(tag[1])) urls.push(tag[1]);
    }
    // kind 31337 streaming tag
    if (tag[0] === 'streaming' && /\.(mp3|ogg|aac|opus|m4a)/i.test(tag[1])) {
      if (!urls.includes(tag[1])) urls.push(tag[1]);
    }
  }

  const audioRegex = /https?:\/\/\S+\.(?:mp3|ogg|wav|flac|aac|opus|m4a)(?:[?#]\S*)?/gi;
  const matches = event.content.match(audioRegex) ?? [];
  for (const m of matches) {
    if (!urls.includes(m)) urls.push(m);
  }

  return urls;
}

export type ExternalEmbedType = 'youtube' | 'twitch' | 'spotify' | 'soundcloud' | 'other';

export interface ExternalEmbed {
  type: ExternalEmbedType;
  url: string;
  /** Embed-friendly iframe src */
  embedUrl: string;
  /** Human label */
  label: string;
  /** Thumbnail URL if known */
  thumbnail?: string;
}

/**
 * Return embed info for a single URL, or null if the URL is not a known
 * external embed source (YouTube, Twitch, Spotify, SoundCloud).
 */
export function getExternalEmbed(url: string): ExternalEmbed | null {
  // YouTube
  const ytMatch = url.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  );
  if (ytMatch) {
    return {
      type: 'youtube',
      url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`,
      label: 'YouTube',
      thumbnail: `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`,
    };
  }

  // Twitch clip
  const twitchClip = url.match(/twitch\.tv\/\w+\/clip\/(\w+)/);
  if (twitchClip) {
    return {
      type: 'twitch',
      url,
      embedUrl: `https://clips.twitch.tv/embed?clip=${twitchClip[1]}&parent=${window.location.hostname}`,
      label: 'Twitch Clip',
    };
  }

  // Twitch stream
  const twitchStream = url.match(/twitch\.tv\/(\w+)(?:$|[^/])/);
  if (twitchStream && !url.includes('/clip/') && !url.includes('/videos/')) {
    return {
      type: 'twitch',
      url,
      embedUrl: `https://player.twitch.tv/?channel=${twitchStream[1]}&parent=${window.location.hostname}`,
      label: 'Twitch Stream',
    };
  }

  // Spotify
  const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/);
  if (spotifyMatch) {
    return {
      type: 'spotify',
      url,
      embedUrl: `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}`,
      label: `Spotify ${spotifyMatch[1]}`,
    };
  }

  // SoundCloud
  if (url.includes('soundcloud.com/') && !url.includes('api.soundcloud')) {
    return {
      type: 'soundcloud',
      url,
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff5500&auto_play=false`,
      label: 'SoundCloud',
    };
  }

  return null;
}

/**
 * Extract external embeds (YouTube, Twitch, Spotify, SoundCloud, etc.)
 * from event content URLs.
 */
export function extractExternalEmbeds(event: NostrEvent): ExternalEmbed[] {
  const embeds: ExternalEmbed[] = [];
  const seen = new Set<string>();

  const allUrls = [
    ...(event.content.match(/https?:\/\/[^\s<>"]+/g) ?? []),
    ...event.tags.filter(([t]) => t === 'url').map(([, u]) => u),
  ];

  for (const url of allUrls) {
    if (seen.has(url)) continue;

    const embed = getExternalEmbed(url);
    if (embed) {
      seen.add(url);
      embeds.push(embed);
    }
  }

  return embeds;
}

/** Get event title from tags */
export function getEventTitle(event: NostrEvent): string | undefined {
  return (
    event.tags.find(([t]) => t === 'title')?.[1] ||
    event.tags.find(([t]) => t === 'subject')?.[1]
  ) || undefined;
}

/** Get cover image from event tags */
export function getCoverImage(event: NostrEvent): string | undefined {
  return (
    event.tags.find(([t]) => t === 'image')?.[1] ||
    event.tags.find(([t]) => t === 'thumb')?.[1] ||
    event.tags.find(([t]) => t === 'thumbnail')?.[1] ||
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
    .replace(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|avif|mp4|webm|mov|mp3|ogg|wav|flac|aac|opus|m4a)(?:[?#]\S*)?/gi, '')
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

/** Check if event is a reply (has 'e' tag) */
export function isReply(event: NostrEvent): boolean {
  return event.tags.some(([t]) => t === 'e');
}

/**
 * Get the direct parent event reference for a reply, following NIP-10 conventions.
 *
 * Priority order:
 *  1. `e` tag with marker "reply"  → direct parent
 *  2. `e` tag with marker "root"   → root of thread (only if no "reply" marker)
 *  3. Last `e` tag                 → legacy positional encoding
 */
export function getParentEventId(event: NostrEvent): { id: string; relay?: string; author?: string } | null {
  const eTags = event.tags.filter(([t]) => t === 'e');
  if (eTags.length === 0) return null;

  // Direct reply marker takes priority
  const replyTag = eTags.find(([, , , marker]) => marker === 'reply');
  if (replyTag) {
    return { id: replyTag[1], relay: replyTag[2] || undefined, author: replyTag[3] || undefined };
  }

  // Single e-tag with no markers → that is the parent
  if (eTags.length === 1) {
    const [, id, relay] = eTags[0];
    return { id, relay: relay || undefined };
  }

  // Multiple e-tags but no "reply" marker: use last one (legacy positional — last = direct parent)
  const last = eTags[eTags.length - 1];
  return { id: last[1], relay: last[2] || undefined };
}

/** Check if event is a repost (kind 6 or generic kind 16) */
export function isRepost(event: NostrEvent): boolean {
  return event.kind === 6 || event.kind === 16;
}

/** Check if event is a community post approval wrapper (kind 4550) */
export function isCommunityApproval(event: NostrEvent): boolean {
  return event.kind === 4550;
}

/**
 * Get the referenced event id from a wrapper event's `e` tag.
 * Used for empty-content reposts (NIP-18) and community approvals that do not
 * embed the original event JSON.
 */
export function getRepostedEventRef(event: NostrEvent): { id: string; relay?: string; author?: string } | null {
  if (!isRepost(event) && !isCommunityApproval(event)) return null;
  const eTags = event.tags.filter(([t]) => t === 'e');
  if (eTags.length === 0) return null;
  const last = eTags[eTags.length - 1];
  return { id: last[1], relay: last[2] || undefined, author: last[3] || undefined };
}

/**
 * Try to extract an embedded event from wrapper kinds whose content is a
 * JSON-encoded Nostr event (reposts: kind 6/16, community approvals: kind 4550).
 * Returns null if the event is not a wrapper or its content is not valid.
 */
export function tryExtractEmbeddedEvent(event: NostrEvent): NostrEvent | null {
  if (!isRepost(event) && !isCommunityApproval(event)) return null;
  if (!event.content) return null;
  try {
    const parsed = JSON.parse(event.content) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).id === 'string' &&
      typeof (parsed as Record<string, unknown>).pubkey === 'string' &&
      typeof (parsed as Record<string, unknown>).created_at === 'number' &&
      typeof (parsed as Record<string, unknown>).kind === 'number' &&
      Array.isArray((parsed as Record<string, unknown>).tags) &&
      typeof (parsed as Record<string, unknown>).content === 'string' &&
      typeof (parsed as Record<string, unknown>).sig === 'string'
    ) {
      return parsed as NostrEvent;
    }
  } catch {
    // not JSON or not an event
  }
  return null;
}

/** Check if kind is long-form article */
export function isLongform(event: NostrEvent): boolean {
  return event.kind === 30023;
}

/** Check if event is a livestream (NIP-53 kind 30311) */
export function isLivestream(event: NostrEvent): boolean {
  return event.kind === 30311;
}

/** Get livestream info from kind 30311 */
export function getLivestreamInfo(event: NostrEvent): {
  title: string;
  status: 'live' | 'ended' | 'planned';
  streamUrl?: string;
  viewers?: number;
  thumbnail?: string;
  /** The actual broadcaster — first p-tagged Host, or the event author */
  hostPubkey: string;
  /** d-tag identifier (needed for naddr links) */
  dTag: string;
} | null {
  if (event.kind !== 30311) return null;
  const title = getEventTitle(event) || 'Live Stream';
  const status = (event.tags.find(([t]) => t === 'status')?.[1] ?? 'live') as 'live' | 'ended' | 'planned';
  const streamUrl =
    event.tags.find(([t]) => t === 'streaming')?.[1] ||
    event.tags.find(([t]) => t === 'recording')?.[1];
  const viewersStr = event.tags.find(([t]) => t === 'current_participants')?.[1];
  const viewers = viewersStr ? parseInt(viewersStr, 10) : undefined;
  const thumbnail = getCoverImage(event);
  const dTag = event.tags.find(([t]) => t === 'd')?.[1] ?? '';
  // Host is the p-tag with role "Host", falling back to event author
  const hostTag = event.tags.find(([t, , , role]) => t === 'p' && role?.toLowerCase() === 'host');
  const hostPubkey = hostTag?.[1] ?? event.pubkey;
  return { title, status, streamUrl, viewers, thumbnail, hostPubkey, dTag };
}

/** Encode a kind 30311 addressable event as an naddr identifier */
export function livestreamToNaddr(event: NostrEvent): string {
  try {
    const { nip19 } = require('nostr-tools') as typeof import('nostr-tools');
    const dTag = event.tags.find(([t]) => t === 'd')?.[1] ?? '';
    return nip19.naddrEncode({ kind: 30311, pubkey: event.pubkey, identifier: dTag });
  } catch {
    return event.id;
  }
}

/** Check if event has displayable media (images, videos, or audio) */
export function hasMedia(event: NostrEvent): boolean {
  return (
    extractImages(event).length > 0 ||
    extractVideos(event).length > 0 ||
    extractAudio(event).length > 0 ||
    extractExternalEmbeds(event).length > 0 ||
    event.kind === 20 ||    // NIP-68 picture
    event.kind === 34235 || // NIP-71 video
    event.kind === 34236    // NIP-71 audio
  );
}

/**
 * Check if event is audio-eligible: true audio files, video FILES (not external
 * embeds), kind 31337 audio tracks, or kind 34236.
 * Uses getAudioTrackInfo as the ground truth — if there's no playable URL, it's not eligible.
 */
export function hasAudio(event: NostrEvent): boolean {
  if (event.kind === 31337 || event.kind === 34236) return true;
  // Must have a concrete playable URL — not just images or external embeds
  const audioUrls = extractAudio(event);
  const videoUrls = extractVideos(event);
  return audioUrls.length > 0 || videoUrls.length > 0;
}

/** Get track info for the audio player from any event */
export function getAudioTrackInfo(event: NostrEvent): {
  title: string;
  url: string;
  artist?: string;
  artwork?: string;
  isVideo?: boolean;
} | null {
  const title = getEventTitle(event) ||
    event.content.slice(0, 60).trim() ||
    'Untitled Track';

  // Prefer audio URL, fall back to video URL
  const audioUrl = extractAudio(event)[0];
  const videoUrl = extractVideos(event)[0];
  const url =
    event.tags.find(([t]) => t === 'streaming')?.[1] ||
    audioUrl ||
    videoUrl;

  if (!url) return null;

  const isVideo = !audioUrl && !!videoUrl;
  const artist = event.tags.find(([t]) => t === 'artist')?.[1];
  const artwork = getCoverImage(event);
  return { title, url, artist, artwork, isVideo };
}

/**
 * Get video/audio duration from event tags (NIP-94 `duration` tag, in seconds).
 * Returns undefined if no duration tag found.
 */
export function getMediaDuration(event: NostrEvent): number | undefined {
  // Check imeta tags for duration
  for (const tag of event.tags) {
    if (tag[0] === 'imeta') {
      const durEntry = tag.find((v) => v.startsWith('duration '));
      if (durEntry) {
        const sec = parseFloat(durEntry.slice(9));
        if (!isNaN(sec) && sec > 0) return Math.round(sec);
      }
    }
  }
  // Direct duration tag
  const dur = event.tags.find(([t]) => t === 'duration')?.[1];
  if (dur) {
    const sec = parseFloat(dur);
    if (!isNaN(sec) && sec > 0) return Math.round(sec);
  }
  return undefined;
}

/** Encode an event to a nevent nip19 identifier for navigation */
export function eventToNevent(event: NostrEvent, relays?: string[]): string {
  try {
    const { nip19 } = require('nostr-tools') as typeof import('nostr-tools');
    return nip19.neventEncode({
      id: event.id,
      author: event.pubkey,
      kind: event.kind,
      ...(relays?.length ? { relays } : {}),
    });
  } catch {
    return event.id;
  }
}

/**
 * Find a relay hint for a specific event id in another event's tags.
 * NIP-18 reposts and NIP-22 quote posts include `e` / `q` tags that may
 * name the relay where the referenced event lives. We can forward that hint
 * into a nevent identifier so the detail page can load it even if the user's
 * normal relay pool doesn't have it.
 */
export function findRelayHintForEvent(event: NostrEvent, eventId: string): string | undefined {
  for (const tag of event.tags) {
    if ((tag[0] === 'e' || tag[0] === 'q') && tag[1] === eventId && tag[2]) {
      return tag[2];
    }
  }
  return undefined;
}
