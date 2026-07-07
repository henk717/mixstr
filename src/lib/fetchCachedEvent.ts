import type { NostrEvent } from '@nostrify/nostrify';
import { cacheEvent, getCachedEvent, isEventCached } from './eventCacheStore';

/**
 * Get cached events for a specific pubkey (for profile feeds)
 * This retrieves events from cache that were previously fetched for this user
 */
export function getCachedEventsForPubkey(pubkey: string): NostrEvent[] {
  try {
    // We store a special key for profile events
    const profileCacheKey = `profile_${pubkey}`;
    const cached = getCachedEvent(profileCacheKey);
    
    console.log('[EventCache] Profile lookup:', profileCacheKey, '- found:', cached ? Array.isArray(cached) ? `${cached.length} events` : 'not array' : 'nothing');
    
    if (cached && Array.isArray(cached)) {
      const validEvents = cached.filter(
        (e) => typeof e === 'object' && e && 'id' in e && 'pubkey' in e
      ) as NostrEvent[];
      
      console.log('[EventCache] Profile restore:', validEvents.length, 'valid events');
      return validEvents;
    }
    
    console.log('[EventCache] Profile cache miss for:', pubkey.slice(0, 16));
    return [];
  } catch (error) {
    console.warn('[EventCache] Profile cache error:', error);
    return [];
  }
}

/**
 * Cache events for a specific pubkey (for profile feeds)
 */
export function cacheEventsForPubkey(pubkey: string, events: NostrEvent[]): void {
  try {
    const profileCacheKey = `profile_${pubkey}`;
    // Store the most recent events (limit to avoid localStorage issues)
    const eventsToCache = events.slice(0, 100);
    
    console.log('[EventCache] Profile store:', profileCacheKey, '- caching', eventsToCache.length, 'events');
    
    cacheEvent(profileCacheKey, eventsToCache);
    
    // Also cache individual events for instant access
    eventsToCache.forEach((event) => cacheEvent(event.id, event));
  } catch (error) {
    console.warn('Event cache: failed to cache profile events', error);
  }
}

/**
 * Fetch an event from cache or relays
 * Returns cached event if available and not expired, otherwise fetches from relays
 */
export async function fetchCachedEvent(
  nostr: ReturnType<import('@nostrify/react').useNostr>['nostr'],
  eventId: string,
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  }
): Promise<NostrEvent | null> {
  const { timeoutMs = 6000, signal } = options ?? {};

  // Check cache first
  const cached = getCachedEvent(eventId);
  if (cached && typeof cached === 'object' && 'id' in cached) {
    const cachedEvent = cached as NostrEvent;
    
    // Validate it's a proper event
    if (cachedEvent.id === eventId && cachedEvent.pubkey && cachedEvent.sig) {
      console.log('[EventCache] HIT:', eventId.slice(0, 16));
      return cachedEvent;
    }
  }

  console.log('[EventCache] MISS:', eventId.slice(0, 16));

  // Fetch from relays
  try {
    const [event] = await nostr.query(
      [{ ids: [eventId], limit: 1 }],
      { signal: signal || AbortSignal.timeout(timeoutMs) }
    );

    if (event) {
      // Cache the event
      cacheEvent(event.id, event);
      return event;
    }

    return null;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'TimeoutError')) {
      console.warn('Event fetch failed:', error);
    }
    return null;
  }
}

/**
 * Fetch multiple events with cache optimization
 * Returns events array with cache hits populated immediately
 */
export async function fetchCachedEvents(
  nostr: ReturnType<import('@nostrify/react').useNostr>['nostr'],
  eventIds: string[],
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  }
): Promise<NostrEvent[]> {
  const { timeoutMs = 6000, signal } = options ?? {};

  // Separate cached and uncached events
  const cachedEvents: NostrEvent[] = [];
  const uncachedIds: string[] = [];

  for (const eventId of eventIds) {
    const cached = getCachedEvent(eventId);
    if (cached && typeof cached === 'object' && 'id' in cached) {
      const cachedEvent = cached as NostrEvent;
      if (cachedEvent.id === eventId && cachedEvent.pubkey && cachedEvent.sig) {
        cachedEvents.push(cachedEvent);
        console.log('[EventCache] HIT:', eventId.slice(0, 16));
      } else {
        uncachedIds.push(eventId);
      }
    } else {
      uncachedIds.push(eventId);
    }
  }

  // Log cache stats
  if (eventIds.length > 0) {
    const hitRate = ((eventIds.length - uncachedIds.length) / eventIds.length * 100).toFixed(1);
    console.log(`[EventCache] Batch: ${hitRate}% hit rate (${cachedEvents.length}/${eventIds.length})`);
  }

  // Fetch uncached events
  if (uncachedIds.length > 0) {
    try {
      const fetchedEvents = await nostr.query(
        [{ ids: uncachedIds, limit: uncachedIds.length }],
        { signal: signal || AbortSignal.timeout(timeoutMs) }
      );

      // Cache and return fetched events
      fetchedEvents.forEach((event) => cacheEvent(event.id, event));
      
      return [...cachedEvents, ...fetchedEvents];
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'TimeoutError')) {
        console.warn('Batch event fetch failed:', error);
      }
      return cachedEvents;
    }
  }

  return cachedEvents;
}

/**
 * Cache a batch of events
 */
export function cacheEvents(events: NostrEvent[]): void {
  events.forEach((event) => cacheEvent(event.id, event));
}