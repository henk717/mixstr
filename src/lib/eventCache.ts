/**
 * Event Cache Barrel Exports
 * 
 * Browser-based caching for Nostr events to improve performance
 * and consistency across page navigations.
 * 
 * @example
 * ```ts
 * import { cacheEvent, getCachedEvent, clearEventCache } from '@/lib/eventCache';
 * 
 * // Cache an event
 * cacheEvent(eventId, event);
 * 
 * // Retrieve from cache
 * const cached = getCachedEvent(eventId);
 * 
 * // Clear all cached events
 * clearEventCache();
 * ```
 */

export {
  cacheEvent,
  getCachedEvent,
  clearEventCache,
  getCacheStats,
  isEventCached,
} from './eventCacheStore';