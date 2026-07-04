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

    // YouTube
    const ytMatch = url.match(
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    );
    if (ytMatch) {
      seen.add(url);
      embeds.push({
        type: 'youtube',
        url,
        embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`,
        label: 'YouTube',
        thumbnail: `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`,
      });
      continue;
    }

    // Twitch clip
    const twitchClip = url.match(/twitch\.tv\/\w+\/clip\/(\w+)/);
    if (twitchClip) {
      seen.add(url);
      embeds.push({
        type: 'twitch',
        url,
        embedUrl: `https://clips.twitch.tv/embed?clip=${twitchClip[1]}&parent=${window.location.hostname}`,
        label: 'Twitch Clip',
      });
      continue;
    }

    // Twitch stream
    const twitchStream = url.match(/twitch\.tv\/(\w+)(?:$|[^/])/);
    if (twitchStream && !url.includes('/clip/') && !url.includes('/videos/')) {
      seen.add(url);
      embeds.push({
        type: 'twitch',
        url,
        embedUrl: `https://player.twitch.tv/?channel=${twitchStream[1]}&parent=${window.location.hostname}`,
        label: 'Twitch Stream',
      });
      continue;
    }

    // Spotify
    const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/);
    if (spotifyMatch) {
      seen.add(url);
      embeds.push({
        type: 'spotify',
        url,
        embedUrl: `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}`,
        label: `Spotify ${spotifyMatch[1]}`,
      });
      continue;
    }

    // SoundCloud
    if (url.includes('soundcloud.com/') && !url.includes('api.soundcloud')) {
      seen.add(url);
      embeds.push({
        type: 'soundcloud',
        url,
        embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff5500&auto_play=false`,
        label: 'SoundCloud',
      });
      continue;
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

/** Check if event is a repost (kind 6) */
export function isRepost(event: NostrEvent): boolean {
  return event.kind === 6;
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
  return { title, status, streamUrl, viewers, thumbnail };
}

/** Check if event has displayable media (images or videos) */
export function hasMedia(event: NostrEvent): boolean {
  return (
    extractImages(event).length > 0 ||
    extractVideos(event).length > 0 ||
    extractExternalEmbeds(event).length > 0 ||
    event.kind === 20 ||   // NIP-68 picture
    event.kind === 34235   // NIP-71 video
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
export function eventToNevent(event: NostrEvent): string {
  try {
    const { nip19 } = require('nostr-tools') as typeof import('nostr-tools');
    return nip19.neventEncode({
      id: event.id,
      author: event.pubkey,
      kind: event.kind,
    });
  } catch {
    return event.id;
  }
}
