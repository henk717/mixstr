/**
 * Local browser cache for Nostr events
 * Stores event JSON in localStorage for faster, more consistent access across pages
 */

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'mixstr_events_';
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 500; // Maximum number of events to store

interface CachedEvent {
  event: unknown;
  timestamp: number;
}

interface EventCache {
  version: number;
  events: Record<string, CachedEvent>;
}

function getCacheKey(eventId: string): string {
  return `${CACHE_PREFIX}${eventId}`;
}

function getCacheIndexKey(): string {
  return `${CACHE_PREFIX}index`;
}

/**
 * Get the current cache index
 */
function getCacheIndex(): EventCache {
  try {
    const stored = localStorage.getItem(getCacheIndexKey());
    if (!stored) {
      return { version: CACHE_VERSION, events: {} };
    }
    const parsed = JSON.parse(stored) as EventCache;
    
    // Migrate if version changed
    if (parsed.version !== CACHE_VERSION) {
      return { version: CACHE_VERSION, events: {} };
    }
    
    return parsed;
  } catch (error) {
    console.warn('Event cache: failed to read index', error);
    return { version: CACHE_VERSION, events: {} };
  }
}

/**
 * Save the cache index
 */
function saveCacheIndex(index: EventCache): void {
  try {
    localStorage.setItem(getCacheIndexKey(), JSON.stringify(index));
  } catch (error) {
    console.warn('Event cache: failed to save index', error);
  }
}

/**
 * Store an event in the cache
 */
export function cacheEvent(eventId: string, event: unknown): void {
  try {
    // Get current index
    const index = getCacheIndex();
    
    // Remove from localStorage directly (old entry)
    localStorage.removeItem(getCacheKey(eventId));
    
    // Add to index
    index.events[eventId] = {
      event,
      timestamp: Date.now(),
    };
    
    // Trim cache if too large (remove oldest events)
    const eventIds = Object.keys(index.events);
    if (eventIds.length > MAX_CACHE_SIZE) {
      const sorted = eventIds
        .map((id) => ({ id, timestamp: index.events[id].timestamp }))
        .sort((a, b) => a.timestamp - b.timestamp);
      
      const toRemove = sorted.slice(0, sorted.length - MAX_CACHE_SIZE + 1);
      toRemove.forEach(({ id }) => {
        delete index.events[id];
        localStorage.removeItem(getCacheKey(id));
      });
    }
    
    // Save updated index
    saveCacheIndex(index);
    
    // Store the event directly in localStorage for quick access
    const cachedData = JSON.stringify(index.events[eventId]);
    localStorage.setItem(getCacheKey(eventId), cachedData);
  } catch (error) {
    console.warn('Event cache: failed to store event', error);
  }
}

/**
 * Get an event from the cache
 */
export function getCachedEvent(eventId: string): unknown {
  try {
    // First try direct access (faster)
    const stored = localStorage.getItem(getCacheKey(eventId));
    if (stored) {
      const cached: CachedEvent = JSON.parse(stored);
      
      // Check if expired
      if (Date.now() - cached.timestamp > CACHE_MAX_AGE) {
        // Clean up expired entry
        const index = getCacheIndex();
        delete index.events[eventId];
        saveCacheIndex(index);
        localStorage.removeItem(getCacheKey(eventId));
        return undefined;
      }
      
      return cached.event;
    }
    
    return undefined;
  } catch (error) {
    console.warn('Event cache: failed to retrieve event', error);
    return undefined;
  }
}

/**
 * Clear all cached events
 */
export function clearEventCache(): void {
  try {
    // Get all cache keys
    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith(CACHE_PREFIX)
    );
    
    // Remove all cache entries
    keys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn('Event cache: failed to clear cache', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  eventCount: number;
  storageSize: number;
  oldestEntry: number | null;
  newestEntry: number | null;
} {
  try {
    const index = getCacheIndex();
    const eventIds = Object.keys(index.events);
    
    if (eventIds.length === 0) {
      return {
        eventCount: 0,
        storageSize: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }
    
    const timestamps = eventIds.map(
      (id) => index.events[id].timestamp
    );
    const storageSize = eventIds.reduce((size, id) => {
      const stored = localStorage.getItem(getCacheKey(id));
      return size + (stored ? stored.length : 0);
    }, 0);
    
    return {
      eventCount: eventIds.length,
      storageSize,
      oldestEntry: Math.min(...timestamps),
      newestEntry: Math.max(...timestamps),
    };
  } catch (error) {
    console.warn('Event cache: failed to get stats', error);
    return {
      eventCount: 0,
      storageSize: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }
}

/**
 * Check if an event is in the cache and not expired
 */
export function isEventCached(eventId: string): boolean {
  return getCachedEvent(eventId) !== undefined;
}