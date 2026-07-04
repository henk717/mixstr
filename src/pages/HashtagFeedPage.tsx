import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { useMixstr } from '@/hooks/useMixstr';

const PAGE_SIZE = 30;

export function HashtagFeedPage() {
  const { tag } = useParams<{ tag: string }>();
  const { nostr } = useNostr();
  const { feedViewModes, setFeedViewMode } = useMixstr();
  const feedKey = `hashtag:${tag}`;
  const mode = feedViewModes[feedKey] ?? 'short';

  useSeoMeta({ title: `#${tag} · Mixstr` });

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<NostrEvent[]>({
    queryKey: ['nostr', 'hashtag-infinite', tag],
    queryFn: async ({ pageParam, signal }) => {
      if (!tag) return [];
      const until = pageParam as number | undefined;
      const timeFilter = until ? { until } : {};
      return nostr.query(
        [{ kinds: [1, 30023], '#t': [tag], limit: PAGE_SIZE, ...timeFilter }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    enabled: !!tag,
    staleTime: 60 * 1000,
  });

  const pages = useMemo(() => data?.pages ?? [], [data]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-2">
          <Hash size={20} className="text-primary" />
          <h1 className="text-lg font-bold">#{tag}</h1>
        </div>
        <div className="px-4 pb-3">
          <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
        </div>
      </div>
      <FeedView
        pages={pages}
        mode={mode}
        isLoading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    </div>
  );
}
