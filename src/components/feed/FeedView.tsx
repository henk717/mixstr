import type { NostrEvent } from '@nostrify/nostrify';
import type { FeedViewMode } from '@/contexts/MixstrContext';
import { ShortPostCard } from './ShortPostCard';
import { LongPostCard } from './LongPostCard';
import { MediaCard } from './MediaCard';
import { AudioCard } from './AudioCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  extractImages,
  extractVideos,
  hasAudio,
  hasMedia,
} from '@/lib/postUtils';

interface FeedViewProps {
  events: NostrEvent[];
  mode: FeedViewMode;
  isLoading?: boolean;
}

function filterForMode(events: NostrEvent[], mode: FeedViewMode): NostrEvent[] {
  switch (mode) {
    case 'media':
      return events.filter((e) => hasMedia(e) || e.kind === 20 || e.kind === 34235);
    case 'audio':
      return events.filter((e) => hasAudio(e) || e.kind === 31337 || e.kind === 34236);
    case 'short':
    case 'longform':
    default:
      return events;
  }
}

export function FeedView({ events, mode, isLoading }: FeedViewProps) {
  if (isLoading) {
    return <FeedSkeleton mode={mode} />;
  }

  const filtered = filterForMode(events, mode);

  if (filtered.length === 0) {
    return (
      <Card className="border-dashed mx-4 my-8">
        <CardContent className="py-12 px-8 text-center">
          <p className="text-muted-foreground max-w-sm mx-auto text-sm">
            {events.length === 0
              ? 'No posts yet. Follow some people or wait for content to load.'
              : `No ${mode} content in your feed right now.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (mode === 'media') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
        {filtered.map((event) => (
          <MediaCard key={event.id} event={event} />
        ))}
      </div>
    );
  }

  if (mode === 'audio') {
    return (
      <div>
        {filtered.map((event) => (
          <AudioCard key={event.id} event={event} />
        ))}
      </div>
    );
  }

  if (mode === 'longform') {
    return (
      <div>
        {filtered.map((event) => (
          <LongPostCard key={event.id} event={event} />
        ))}
      </div>
    );
  }

  // short (default)
  return (
    <div>
      {filtered.map((event) => (
        <ShortPostCard key={event.id} event={event} />
      ))}
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
