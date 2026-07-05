import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useEventById } from '@/hooks/useEventById';
import { isRepost, isCommunityApproval, tryExtractEmbeddedEvent, getRepostedEventRef } from '@/lib/postUtils';

export interface ResolvedEvent {
  /** The event to render (the embedded/reposted event, or the original event). */
  event: NostrEvent;
  /** The wrapper event if the input was a repost/community approval. */
  wrapper: NostrEvent | null;
  /**
   * True while fetching the referenced event for an empty-content repost.
   * False for non-wrappers, content-embedded wrappers, or wrappers without a
   * resolvable `e` tag.
   */
  isLoading: boolean;
}

/**
 * Resolves a possibly-wrapped event into the event that should actually be
 * rendered.
 *
 * Behavior:
 *  - Non-wrapper events return the input event as-is with no wrapper.
 *  - Reposts/community approvals whose `content` contains a JSON-encoded
 *    Nostr event parse and return that embedded event.
 *  - Empty-content reposts (allowed by NIP-18) fetch the referenced event via
 *    the `e` tag and return it once loaded.
 *  - Wrapper events that cannot be resolved fall back to rendering the
 *    wrapper itself (rare; usually a malformed repost).
 *
 * The wrapper is preserved so callers can render "X reposted" banners and link
 * to the wrapper event for detail pages.
 */
export function useResolvedEvent(event: NostrEvent | undefined | null): ResolvedEvent {
  const isWrapper = !!event && (isRepost(event) || isCommunityApproval(event));
  const wrapper = isWrapper ? event : null;

  const embeddedEvent = useMemo(() => {
    if (!event) return null;
    return tryExtractEmbeddedEvent(event);
  }, [event]);

  const repostRef = useMemo(() => {
    if (!event || embeddedEvent) return null;
    return getRepostedEventRef(event);
  }, [event, embeddedEvent]);

  const shouldFetch = !!repostRef && !embeddedEvent;

  const { data: fetchedEvent, isLoading } = useEventById({
    eventId: repostRef?.id ?? '',
    pubkey: repostRef?.author,
    relayHints: repostRef?.relay ? [repostRef.relay] : undefined,
    timeoutMs: 8000,
    enabled: shouldFetch,
    staleTime: 60 * 1000,
  });

  if (!event) {
    return { event: event as NostrEvent, wrapper: null, isLoading: false };
  }

  if (embeddedEvent) {
    return { event: embeddedEvent, wrapper, isLoading: false };
  }

  if (fetchedEvent) {
    return { event: fetchedEvent, wrapper, isLoading: false };
  }

  return { event, wrapper, isLoading };
}
