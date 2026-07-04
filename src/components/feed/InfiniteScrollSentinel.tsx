import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface InfiniteScrollSentinelProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  /** Optional: loading skeleton variant for current view mode */
  variant?: 'list' | 'grid' | 'audio';
}

export function InfiniteScrollSentinel({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  variant = 'list',
}: InfiniteScrollSentinelProps) {
  const { ref, inView } = useInView({ threshold: 0, rootMargin: '200px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!hasNextPage && !isFetchingNextPage) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground/50">
        You've reached the end
      </div>
    );
  }

  return (
    <div ref={ref} className="py-2">
      {isFetchingNextPage && <LoadingSkeleton variant={variant} />}
    </div>
  );
}

function LoadingSkeleton({ variant }: { variant: 'list' | 'grid' | 'audio' }) {
  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-4 pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
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

  if (variant === 'audio') {
    return (
      <div className="space-y-0">
        {Array.from({ length: 3 }).map((_, i) => (
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

  // list (default)
  return (
    <div className="space-y-0">
      {Array.from({ length: 3 }).map((_, i) => (
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
        </div>
      ))}
    </div>
  );
}
