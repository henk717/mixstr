import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Hash, Plus, Check } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { useMixstr } from '@/hooks/useMixstr';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { createListId, listTimestamp } from '@/lib/sidebarLists';
import type { SidebarList } from '@/lib/sidebarLists';

const PAGE_SIZE = 30;

export function HashtagFeedPage() {
  const { tag } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { sidebarLists, addSidebarList, setSidebarLists } = useMixstr();
  const { feedViewModes, setFeedViewMode } = useMixstr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
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
        [{ kinds: [1, 30023, 30311], '#t': [tag], limit: PAGE_SIZE, ...timeFilter }],
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

  // Check if user is already following this hashtag
  const isFollowing = useMemo(() => {
    if (!tag || !user?.pubkey) return false;
    return sidebarLists.some(list =>
      list.sources.some(source => source.type === 'hashtag' && source.tag === tag)
    );
  }, [sidebarLists, tag, user?.pubkey]);

  const handleFollowHashtag = () => {
    if (!tag || !user?.pubkey) return;

    // Check if already following
    const existingList = sidebarLists.find(list =>
      list.sources.some(source => source.type === 'hashtag' && source.tag === tag)
    );

    if (existingList) {
      // Already in a list, navigate to it
      navigate(`/list/${existingList.id}`);
      return;
    }

    // Create a new list with this hashtag
    const newList: SidebarList = {
      id: createListId(),
      label: `#${tag}`,
      icon: 'hash',
      sources: [
        {
          id: createListId().replace('list-', 'src-'),
          type: 'hashtag',
          tag: tag,
        },
      ],
      pinned: false,
      createdAt: listTimestamp(),
    };

    addSidebarList(newList);
    toast({
      title: `Following #${tag}`,
      description: `You're now following posts tagged with #${tag}`,
    });

    // Navigate to the new list
    navigate(`/list/${newList.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <Hash size={20} className="text-primary" />
          <div className="flex-1">
            <h1 className="text-lg font-bold">#{tag}</h1>
            <p className="text-xs text-muted-foreground">
              Posts tagged with #{tag}
            </p>
          </div>
          {user && (
            <Button
              size="sm"
              variant={isFollowing ? 'outline' : 'default'}
              onClick={handleFollowHashtag}
              className="gap-1.5"
            >
              {isFollowing ? (
                <>
                  <Check size={14} />
                  Following
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Follow
                </>
              )}
            </Button>
          )}
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
        emptyMessage={`No posts found for #${tag}. Be the first to post!`}
      />
    </div>
  );
}
