import { useQuery } from '@tanstack/react-query';
import { useMixstr } from '@/hooks/useMixstr';
import type { ListSource } from '@/lib/sidebarLists';

export interface RssEnclosure {
  url: string;
  type: string;
  length?: number;
}

export interface RssItem {
  id: string;         // stable id derived from guid/link
  title: string;
  description: string;
  link: string;
  pubDate: number;    // unix timestamp
  image?: string;
  feedTitle: string;
  feedUrl: string;
  /** Direct audio/video enclosure from the feed */
  enclosure?: RssEnclosure;
  /** Duration in seconds if supplied by the feed */
  durationSec?: number;
}

function proxyUrl(url: string, primary: string, backup?: string) {
  const encoded = encodeURIComponent(url);
  return { primary: `${primary}${encoded}`, backup: backup ? `${backup}${encoded}` : undefined };
}

/** Simple hash for a string → deterministic short id */
function stableId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function getText(el: Element, tag: string): string {
  return el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
}

/** Guess MIME type from a URL. */
function getMimeFromUrl(url: string): string {
  const u = url.split('?')[0].toLowerCase();
  if (/\.(mp3|m4a|ogg|wav|flac|aac|opus)$/.test(u)) return 'audio/mpeg';
  if (/\.(mp4|webm|mov|mkv|avi)$/.test(u)) return 'video/mp4';
  return '';
}

/**
 * Parse iTunes duration tag.
 * Accepts seconds-only, MM:SS, or HH:MM:SS.
 */
function parseItunesDuration(value: string): number | undefined {
  const trimmed = value.trim();
  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.some((n) => isNaN(n))) return undefined;
  if (parts.length === 1) return parts[0] || undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

function parseRss(xml: string, feedUrl: string): RssItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const isAtom = doc.documentElement.tagName === 'feed';
  const feedTitle =
    doc.querySelector('channel > title')?.textContent?.trim() ||
    doc.querySelector('feed > title')?.textContent?.trim() ||
    feedUrl;

  // Channel/feed-level artwork is used as a fallback for items without their own image.
  const itunesNs = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
  const channelEl = doc.querySelector('channel');
  const feedImage =
    channelEl?.querySelector('image > url')?.textContent?.trim() ||
    channelEl?.getElementsByTagNameNS(itunesNs, 'image')[0]?.getAttribute('href') ||
    doc.querySelector('feed > logo')?.textContent?.trim() ||
    doc.querySelector('feed > icon')?.textContent?.trim() ||
    '';

  const items = isAtom
    ? Array.from(doc.querySelectorAll('feed > entry'))
    : Array.from(doc.querySelectorAll('channel > item'));

  return items.map((item) => {
    // Title
    const title = item.querySelector('title')?.textContent?.trim() ?? '(untitled)';

    // Link
    let link = '';
    if (isAtom) {
      link =
        item.querySelector('link[rel="alternate"]')?.getAttribute('href') ||
        item.querySelector('link')?.getAttribute('href') ||
        item.querySelector('link')?.textContent?.trim() ||
        '';
    } else {
      link =
        item.querySelector('link')?.textContent?.trim() ||
        item.querySelector('guid')?.textContent?.trim() ||
        '';
    }

    // Guid / stable id
    const guid =
      item.querySelector('guid')?.textContent?.trim() ||
      item.querySelector('id')?.textContent?.trim() ||
      link;
    const id = `rss:${stableId(guid || title + feedUrl)}`;

    // Description / summary (strip HTML tags)
    const rawDesc =
      item.querySelector('description')?.textContent?.trim() ||
      item.querySelector('summary')?.textContent?.trim() ||
      item.querySelector('content')?.textContent?.trim() ||
      '';
    // Strip HTML entities and tags for plain text preview
    const descEl = document.createElement('div');
    descEl.innerHTML = rawDesc;
    const description = (descEl.textContent ?? '').trim().slice(0, 500);

    // Publication date
    const dateStr =
      item.querySelector('pubDate')?.textContent?.trim() ||
      item.querySelector('published')?.textContent?.trim() ||
      item.querySelector('updated')?.textContent?.trim() ||
      '';
    const pubDate = dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : Math.floor(Date.now() / 1000);

    // Image: try <media:thumbnail>, <media:content>, <enclosure type="image/*">, itunes:image, og-style
    let image: string | undefined;
    const mediaNs = 'http://search.yahoo.com/mrss/';
    const mediaThumbnail =
      item.getElementsByTagNameNS(mediaNs, 'thumbnail')[0]?.getAttribute('url') ||
      item.querySelector('enclosure[type^="image/"]')?.getAttribute('url') || undefined;
    if (mediaThumbnail) {
      image = mediaThumbnail;
    } else {
      const mediaContent = item.getElementsByTagNameNS(mediaNs, 'content')[0];
      const mediaContentUrl = mediaContent?.getAttribute('url');
      const mediaContentType = mediaContent?.getAttribute('type')?.toLowerCase();
      if (mediaContentUrl && mediaContentType?.startsWith('image/')) {
        image = mediaContentUrl;
      }
    }
    if (!image) {
      image = item.getElementsByTagNameNS(itunesNs, 'image')[0]?.getAttribute('href') ?? undefined;
    }
    // Fallback: first img src in the HTML description
    if (!image && rawDesc.includes('<img')) {
      const m = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) image = m[1];
    }

    // Last resort: use the podcast/feed-level cover art for episodes without one.
    if (!image) {
      image = feedImage || undefined;
    }

    // Direct media enclosure (audio/video). Prefer explicit audio/video enclosure.
    let enclosure: RssEnclosure | undefined;
    const audioTypes = /^(audio\/|video\/|application\/octet-stream$)/i;

    // 1) <enclosure>
    const enc = item.querySelector('enclosure');
    const encType = enc?.getAttribute('type')?.toLowerCase();
    const encUrl = enc?.getAttribute('url');
    if (encUrl && encType && audioTypes.test(encType)) {
      const lenStr = enc.getAttribute('length');
      enclosure = { url: encUrl, type: encType, length: lenStr ? Number(lenStr) : undefined };
    }

    // 2) <media:content> audio/video
    const mediaContent = item.getElementsByTagNameNS(mediaNs, 'content')[0];
    if (!enclosure) {
      const mcUrl = mediaContent?.getAttribute('url');
      const mcType = mediaContent?.getAttribute('type')?.toLowerCase() ??
        (mcUrl ? getMimeFromUrl(mcUrl) : '');
      if (mcUrl && /^(audio\/|video\/)/i.test(mcType)) {
        enclosure = { url: mcUrl, type: mcType };
      }
    }

    // Duration
    let durationSec: number | undefined;
    const itunesDur = item.getElementsByTagNameNS(itunesNs, 'duration')[0]?.textContent?.trim();
    if (itunesDur) {
      durationSec = parseItunesDuration(itunesDur);
    }
    if (!durationSec) {
      const durAttr = enc?.getAttribute('duration') ?? mediaContent?.getAttribute('duration');
      if (durAttr) {
        const n = Number(durAttr);
        if (!isNaN(n) && n > 0) durationSec = n;
      }
    }

    return { id, title, description, link, pubDate, image, feedTitle, feedUrl, enclosure, durationSec };
  }).filter((item) => item.link); // require a link
}

/** Fetch and parse a single RSS/Atom feed URL */
async function fetchRss(url: string, signal: AbortSignal): Promise<RssItem[]> {
  const { corsProxy } = useMixstr();
  const { primary: primaryUrl, backup: backupUrl } = proxyUrl(url, corsProxy.primary, corsProxy.backup);

  // Try primary proxy first
  try {
    const res = await fetch(primaryUrl, { signal });
    if (res.ok) {
      const text = await res.text();
      return parseRss(text, url);
    }
    
    // If primary fails and we have a backup, try backup
    if (backupUrl) {
      const backupRes = await fetch(backupUrl, { signal });
      if (backupRes.ok) {
        const text = await backupRes.text();
        return parseRss(text, url);
      }
      
      // Both failed, throw error with primary status
      throw new Error(`HTTP ${res.status} for ${url} (primary failed, backup also failed)`);
    }
    
    // No backup, throw error
    throw new Error(`HTTP ${res.status} for ${url}`);
  } catch (error) {
    // If it's an AbortError, rethrow it
    if (signal.aborted) throw error;
    // Otherwise wrap it
    throw new Error(`Failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fetches all RSS sources from a list and returns merged, sorted items.
 */
export function useRssFeed(sources: ListSource[]) {
  const rssSources = sources.filter((s) => s.type === 'rss' && s.url);

  return useQuery<RssItem[]>({
    queryKey: ['rss-feed', rssSources.map((s) => s.url).join(',')],
    queryFn: async ({ signal }) => {
      if (rssSources.length === 0) return [];

      const abort = AbortSignal.any([signal, AbortSignal.timeout(12000)]);

      const results = await Promise.allSettled(
        rssSources.map((s) => fetchRss(s.url!, abort)),
      );

      const all: RssItem[] = [];
      const seen = new Set<string>();

      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const item of result.value) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              all.push(item);
            }
          }
        }
      }

      return all.sort((a, b) => b.pubDate - a.pubDate);
    },
    enabled: rssSources.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
}
