import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import type { FeedViewMode } from '@/contexts/MixstrContext';
import { ShortPostCard } from './ShortPostCard';
import { LongPostCard } from './LongPostCard';
import { MediaCard } from './MediaCard';
import { AudioCard } from './AudioCard';
import { LivestreamCard } from './LivestreamCard';
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { hasAudio, hasMedia, isLivestream } from '@/lib/postUtils';

interface FeedViewProps {
  /** Flat list of events (for non-paginated use) */
  events?: NostrEvent[];
  /** Pages of events from useInfiniteQuery */
  pages?: NostrEvent[][];
  mode: FeedViewMode;
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}

function filterForMode(events: NostrEvent[], mode: FeedViewMode): NostrEvent[] {
  switch (mode) {
    case 'media':
      return events.filter((e) => isLivestream(e) || hasMedia(e) || e.kind === 20 || e.kind === 34235);
    case 'audio':
      // Videos are also audio-eligible (played as audio in the player bar)
      return events.filter((e) => isLivestream(e) || hasAudio(e) || e.kind === 31337 || e.kind === 34236);
    case 'short':
    case 'longform':
    default:
      return events;
  }
}

export function FeedView({
  events: flatEvents,
  pages,
  mode,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: FeedViewProps) {
  // Merge flat events or pages into one deduplicated list
  const allEvents = useMemo(() => {
    let raw: NostrEvent[];
    if (pages !== undefined) {
      raw = pages.flatMap((p) => (Array.isArray(p) ? p : []));
    } else {
      raw = flatEvents ?? [];
    }
    const seen = new Set<string>();
    return raw.filter((e) => {
      if (!e?.id || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [pages, flatEvents]);

  if (isLoading && allEvents.length === 0) {
    return <FeedSkeleton mode={mode} />;
  }

  const filtered = filterForMode(allEvents, mode);

  // Separate live streams — always float to top of every feed
  const livestreams = filtered.filter(isLivestream);
  const regularEvents = filtered.filter((e) => !isLivestream(e));

  const isPaginated = !!fetchNextPage;
  const sentinelVariant = mode === 'media' ? 'grid' : mode === 'audio' ? 'audio' : 'list';

  if (filtered.length === 0 && !isLoading) {
    return (
      <Card className="border-dashed mx-4 my-8">
        <CardContent className="py-12 px-8 text-center">
          <p className="text-muted-foreground max-w-sm mx-auto text-sm">
            {allEvents.length === 0
              ? 'No posts yet. Follow some people or wait for content to load.'
              : `No ${mode} content in your feed right now.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {/* Livestreams always pinned to the top of every feed */}
      {livestreams.length > 0 && (
        <div className="py-1">
          {livestreams.map((event) => (
            <LivestreamCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Regular content */}
      {mode === 'media' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
          {regularEvents.map((event) => (
            <MediaCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {mode === 'audio' && regularEvents.map((event) => (
        <AudioCard key={event.id} event={event} />
      ))}

      {mode === 'longform' && regularEvents.map((event) => (
        <LongPostCard key={event.id} event={event} />
      ))}

      {(mode === 'short' || (mode !== 'media' && mode !== 'audio' && mode !== 'longform')) &&
        regularEvents.map((event) => (
          <ShortPostCard key={event.id} event={event} />
        ))
      }

      {isPaginated && (
        <InfiniteScrollSentinel
          hasNextPage={hasNextPage ?? false}
          isFetchingNextPage={isFetchingNextPage ?? false}
          fetchNextPage={fetchNextPage!}
          variant={sentinelVariant}
        />
      )}
    </div>
  );
}

function FeedSkeleton({ mode }: { mode: FeedViewMode }) {
  if (mode === 'media') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden bg-card border border-border">
            <Skeleton className="aspect-video w-full" />
            <div className="p-3 space-y-1.5">
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (mode === 'audio') {
    return (
      <div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border">
            <Skeleton className="w-14 h-14 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-4 py-4 border-b border-border space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}
