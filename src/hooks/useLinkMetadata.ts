import { useEffect, useState } from 'react';

export interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url?: string;
}

interface CacheEntry {
  data?: LinkMetadata;
  error?: Error;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch OpenGraph metadata from a URL using a CORS proxy.
 * Returns title, description, image, and siteName if available.
 */
async function fetchMetadata(url: string, signal: AbortSignal): Promise<LinkMetadata> {
  try {
    // Use a CORS proxy to fetch the HTML
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, { signal });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const data = await response.json();
    const html = data.contents;
    
    // Parse HTML to extract OpenGraph metadata
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const extractMeta = (name: string): string | undefined => {
      const tag = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      return tag?.getAttribute('content');
    };
    
    return {
      title: extractMeta('og:title') || extractMeta('twitter:title') || doc.title,
      description: extractMeta('og:description') || extractMeta('twitter:description'),
      image: extractMeta('og:image') || extractMeta('twitter:image'),
      siteName: extractMeta('og:site_name'),
      url: extractMeta('og:url') || url,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

interface UseLinkMetadataOptions {
  url: string | undefined;
  enabled?: boolean;
  /** Only fetch when visible (for lazy loading) */
  visible?: boolean;
}

export function useLinkMetadata({ url, enabled = true, visible = true }: UseLinkMetadataOptions) {
  const [metadataState, setMetadataState] = useState<{
    data?: LinkMetadata;
    loading: boolean;
    error?: Error;
  }>(() => {
    if (!url || !enabled) return { data: undefined, loading: false, error: undefined };
    
    const cached = cache.get(url);
    if (cached?.data && cached.timestamp + CACHE_DURATION > Date.now()) {
      return { data: cached.data, loading: false, error: undefined };
    }
    if (cached?.error && cached.timestamp + CACHE_DURATION > Date.now()) {
      return { data: undefined, loading: false, error: cached.error };
    }
    return { data: undefined, loading: true, error: undefined };
  });

  useEffect(() => {
    if (!url || !enabled || !visible) {
      if (!url) {
        setMetadataState({ data: undefined, loading: false, error: undefined });
      }
      return;
    }

    // Check cache first
    const cached = cache.get(url);
    if (cached?.data && cached.timestamp + CACHE_DURATION > Date.now()) {
      if (metadataState.loading) {
        setMetadataState({ data: cached.data, loading: false, error: undefined });
      }
      return;
    }
    if (cached?.error && cached.timestamp + CACHE_DURATION > Date.now()) {
      if (metadataState.loading) {
        setMetadataState({ data: undefined, loading: false, error: cached.error });
      }
      return;
    }

    // Only fetch if we're in loading state and visible
    if (!metadataState.loading) return;

    const controller = new AbortController();
    
    fetchMetadata(url, controller.signal).then(
      (data) => {
        cache.set(url, { data, timestamp: Date.now() });
        if (!controller.signal.aborted) {
          setMetadataState({ data, loading: false, error: undefined });
        }
      },
      (err: Error) => {
        if (err.name === 'AbortError') return;
        cache.set(url, { error: err, timestamp: Date.now() });
        if (!controller.signal.aborted) {
          setMetadataState({ data: undefined, loading: false, error: err });
        }
      },
    );

    return () => {
      controller.abort();
    };
  }, [url, enabled, visible, metadataState.loading]);

  return metadataState;
}