import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { useMixstr } from '@/hooks/useMixstr';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe } from 'lucide-react';

const PAGE_SIZE = 30;

interface ProfilePageProps {
  pubkey: string;
}

export function ProfilePage({ pubkey }: ProfilePageProps) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  const { nostr } = useNostr();
  const { feedViewModes, setFeedViewMode } = useMixstr();
  const feedKey = `profile:${pubkey}`;
  const mode = feedViewModes[feedKey] ?? 'short';

  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || pubkey.slice(0, 16) + '…';

  useSeoMeta({ title: `${displayName} · Mixstr` });

  const {
    data,
    isLoading: feedLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<NostrEvent[]>({
    queryKey: ['nostr', 'profile-feed-infinite', pubkey],
    queryFn: async ({ pageParam, signal }) => {
      const until = pageParam as number | undefined;
      const timeFilter = until ? { until } : {};
      return nostr.query(
        [{ kinds: [1, 6, 20, 30023, 30311, 31337, 34235], authors: [pubkey], limit: PAGE_SIZE, ...timeFilter }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[lastPage.length - 1].created_at - 1;
    },
    initialPageParam: undefined as number | undefined,
    staleTime: 60 * 1000,
  });

  const pages = useMemo(() => data?.pages ?? [], [data]);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header/banner */}
      <div className="relative">
        {meta?.banner ? (
          <div className="h-32 overflow-hidden">
            <img src={meta.banner} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="h-32 bg-gradient-to-r from-primary/20 to-primary/5" />
        )}

        <div className="px-4 -mt-10 flex items-end justify-between">
          <Avatar className="w-20 h-20 border-4 border-background">
            <AvatarImage src={meta?.picture} />
            <AvatarFallback className="bg-primary/20 text-primary text-2xl font-black">
              {author.isLoading ? '?' : displayName[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <Button
            variant="outline"
            size="sm"
            className="border-border hover:border-primary hover:text-primary transition-colors mb-1"
          >
            Follow
          </Button>
        </div>
      </div>

      {/* Profile info */}
      <div className="px-4 pt-3 pb-4 border-b border-border">
        {author.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
            {meta?.nip05 && (
              <p className="text-sm text-muted-foreground">{meta.nip05}</p>
            )}
            {meta?.about && (
              <p className="text-sm text-foreground mt-2 leading-relaxed whitespace-pre-wrap">
                {meta.about}
              </p>
            )}
            <div className="flex flex-wrap gap-3 mt-2">
              {meta?.website && (
                <a
                  href={meta.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Globe size={12} />
                  {meta.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </>
        )}
      </div>

      {/* Feed */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-2">
          <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
        </div>
      </div>

      <FeedView
        pages={pages}
        mode={mode}
        isLoading={feedLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    </div>
  );
}
