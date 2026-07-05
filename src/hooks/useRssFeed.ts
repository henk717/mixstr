import { useQuery } from '@tanstack/react-query';
import type { ListSource } from '@/lib/sidebarLists';

export interface RssItem {
  id: string;         // stable id derived from guid/link
  title: string;
  description: string;
  link: string;
  pubDate: number;    // unix timestamp
  image?: string;
  feedTitle: string;
  feedUrl: string;
}

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

function proxyUrl(url: string) {
  return `${CORS_PROXY}${encodeURIComponent(url)}`;
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

function parseRss(xml: string, feedUrl: string): RssItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const isAtom = doc.documentElement.tagName === 'feed';
  const feedTitle =
    doc.querySelector('channel > title')?.textContent?.trim() ||
    doc.querySelector('feed > title')?.textContent?.trim() ||
    feedUrl;

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

    // Image: try <media:thumbnail>, <media:content>, <enclosure type="image/*">, og-style
    let image: string | undefined;
    const mediaNs = 'http://search.yahoo.com/mrss/';
    const mediaThumbnail =
      item.getElementsByTagNameNS(mediaNs, 'thumbnail')[0]?.getAttribute('url') ||
      item.getElementsByTagNameNS(mediaNs, 'content')[0]?.getAttribute('url');
    if (mediaThumbnail) {
      image = mediaThumbnail;
    } else {
      const enclosure = item.querySelector('enclosure');
      if (enclosure?.getAttribute('type')?.startsWith('image/')) {
        image = enclosure.getAttribute('url') ?? undefined;
      }
    }
    // Fallback: first img src in the HTML description
    if (!image && rawDesc.includes('<img')) {
      const m = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) image = m[1];
    }

    return { id, title, description, link, pubDate, image, feedTitle, feedUrl };
  }).filter((item) => item.link); // require a link
}

/** Fetch and parse a single RSS/Atom feed URL */
async function fetchRss(url: string, signal: AbortSignal): Promise<RssItem[]> {
  const res = await fetch(proxyUrl(url), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  return parseRss(text, url);
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
