import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { RefreshCw, Pencil } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMixstr } from '@/hooks/useMixstr';
import { useListFeed } from '@/hooks/useListFeed';
import { useRssFeed } from '@/hooks/useRssFeed';
import { useMuteList } from '@/hooks/useMuteList';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCommunityMetas, isModeratorOf } from '@/hooks/useCommunity';
import { FeedView } from '@/components/feed/FeedView';
import { ShortPostCard } from '@/components/feed/ShortPostCard';
import { RssItemCard } from '@/components/feed/RssItemCard';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { ListIcon } from '@/components/layout/ListIcon';
import { EditListDialog } from '@/components/layout/EditListDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { sourceDescription } from '@/lib/sidebarLists';
import { tryExtractEmbeddedEvent } from '@/lib/postUtils';
import { buildSpeedIndex } from '@/lib/spam';
import type { RssItem } from '@/hooks/useRssFeed';
import type { NostrEvent } from '@nostrify/nostrify';

type MergedEntry =
  | { type: 'nostr'; ts: number; event: NostrEvent }
  | { type: 'rss'; ts: number; item: RssItem };

export function ListFeedPage() {
  const { id } = useParams<{ id: string }>();
  const { sidebarLists, updateSidebarList, feedViewModes, setFeedViewMode, spamSettings } = useMixstr();
  const [editOpen, setEditOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isMuted } = useMuteList();
  const queryClient = useQueryClient();

  const list = sidebarLists.find((l) => l.id === id);
  const feedKey = `list:${id}`;
  const mode = feedViewModes[feedKey] ?? 'short';
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();
  const { toast } = useToast();

  useSeoMeta({ title: `${list?.label ?? 'Feed'} · Mixstr` });

  // Community moderation state
  const communityAddrs = useMemo(
    () => (list?.sources ?? []).filter((s) => s.type === 'community' && s.communityId).map((s) => s.communityId!),
    [list?.sources],
  );
  const { data: communityMetas = new Map<string, NostrEvent>() } = useCommunityMetas(communityAddrs);
  const moderatorCommunities = useMemo(() => {
    const set = new Set<string>();
    if (!user?.pubkey) return set;
    for (const addr of communityAddrs) {
      if (isModeratorOf(communityMetas.get(addr), user.pubkey)) {
        set.add(addr);
      }
    }
    return set;
  }, [communityAddrs, communityMetas, user?.pubkey]);

  const {
    data,
    isLoading: nostrLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch: refetchNostr,
    isLoadingDvm,
  } = useListFeed(list ?? { id: '', label: '', icon: 'hash', sources: [], createdAt: 0 });

  const rssSources = useMemo(
    () => (list?.sources ?? []).filter((s) => s.type === 'rss' && s.url),
    [list?.sources],
  );
  const hasRssSources = rssSources.length > 0;
  const hasNostrSources = useMemo(
    () => (list?.sources ?? []).some((s) => s.type !== 'rss' && s.type !== 'fediverse'),
    [list?.sources],
  );

  const {
    data: rssItems = [],
    isLoading: rssLoading,
    refetch: refetchRss,
  } = useRssFeed(list?.sources ?? []);

  const nostrPages = useMemo(() => data?.pages ?? [], [data]);
  const allNostrEvents = useMemo(
    () => nostrPages.flatMap((p) => (Array.isArray(p) ? p : [])),
    [nostrPages],
  );

  // Determine which posts are already approved so we only show the Approve
  // button on unapproved kind-1 posts in communities the user moderates.
  const approvedIds = useMemo(() => {
    const set = new Set<string>();
    for (const event of allNostrEvents) {
      if (event.kind === 1111) {
        set.add(event.id);
        continue;
      }
      if (event.kind === 4550) {
        for (const tag of event.tags) {
          if ((tag[0] === 'e' || tag[0] === 'a' || tag[0] === 'A') && tag[1]) {
            set.add(tag[1]);
          }
        }
        const inner = tryExtractEmbeddedEvent(event);
        if (inner) set.add(inner.id);
      }
    }
    return set;
  }, [allNostrEvents]);

  const isLoading = nostrLoading || isLoadingDvm || (hasRssSources && rssLoading);

  const moderation = useMemo(() => {
    if (!user?.pubkey || moderatorCommunities.size === 0) return undefined;

    const canApprove = (event: NostrEvent) => {
      if (event.kind !== 1) return false;
      if (approvedIds.has(event.id)) return false;
      return event.tags.some(
        ([t, v]) =>
          (t === 'a' || t === 'A') &&
          v &&
          v.startsWith('34550:') &&
          moderatorCommunities.has(v),
      );
    };

    const onApprove = async (event: NostrEvent) => {
      const communityAddr = event.tags
        .filter(([t, v]): v is string => (t === 'a' || t === 'A') && typeof v === 'string' && v.startsWith('34550:'))
        .map(([, v]) => v)
        .find((v) => moderatorCommunities.has(v));

      if (!communityAddr) {
        toast({ title: 'Cannot approve', description: 'No moderated community found for this post.', variant: 'destructive' });
        return;
      }

      try {
        await publish({
          kind: 4550,
          content: JSON.stringify(event),
          tags: [
            ['a', communityAddr],
            ['e', event.id],
            ['p', event.pubkey],
            ['k', String(event.kind)],
          ],
        });
        toast({ title: 'Post approved', description: 'The post is now approved for this community.' });
        await queryClient.invalidateQueries({ queryKey: ['nostr', 'list-feed-infinite', id] });
      } catch (err) {
        toast({ title: 'Approval failed', description: String(err), variant: 'destructive' });
      }
    };

    return { canApprove, onApprove };
  }, [approvedIds, moderatorCommunities, publish, queryClient, toast, user?.pubkey, id]);

  async function handleRefetch() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      // Invalidate the query cache so the data is marked stale and re-fetched
      await queryClient.invalidateQueries({ queryKey: ['nostr', 'list-feed-infinite', id] });
      await queryClient.invalidateQueries({ queryKey: ['nostr', 'list-dvm-results', id] });
      await Promise.all([
        refetchNostr(),
        hasRssSources ? refetchRss() : Promise.resolve(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }

  // Build interleaved timeline for short mode when RSS sources exist
  const mergedTimeline = useMemo<MergedEntry[]>(() => {
    if (!hasRssSources || mode !== 'short') return [];

    const speedIndex = spamSettings.speed.enabled
      ? buildSpeedIndex(allNostrEvents, spamSettings.speed.windowMinutes)
      : new Map<string, number>();

    const entries: MergedEntry[] = [
      ...allNostrEvents
        .filter((e) => !isMuted(e, speedIndex))
        .map((event) => ({ type: 'nostr' as const, ts: event.created_at, event })),
      ...rssItems.map((item) => ({ type: 'rss' as const, ts: item.pubDate, item })),
    ];
    entries.sort((a, b) => b.ts - a.ts);
    return entries;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRssSources, mode, allNostrEvents, rssItems, spamSettings.speed.enabled, spamSettings.speed.windowMinutes]);

  if (!list) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">List not found.</p>
        <Link to="/" className="text-primary text-sm mt-2 block hover:underline">
          Go home
        </Link>
      </div>
    );
  }

  const showMerged = hasRssSources && mode === 'short';

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <ListIcon icon={list.icon} size={20} className="text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-foreground truncate">{list.label}</h1>
            {list.sources.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {list.sources.map((src) => (
                  <Badge
                    key={src.id}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground"
                  >
                    {src.label ?? sourceDescription(src)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-primary"
              onClick={() => void handleRefetch()}
              disabled={isRefreshing || isLoading}
              title="Refresh"
            >
              <RefreshCw size={15} className={isRefreshing || isLoading ? 'animate-spin' : ''} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-primary"
              onClick={() => setEditOpen(true)}
              title="Edit list"
            >
              <Pencil size={15} />
            </Button>
          </div>
        </div>

        {/* View mode switcher — only useful when Nostr sources exist */}
        {hasNostrSources && (
          <div className="px-4 pb-3">
            <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
          </div>
        )}
      </div>

      {/* ── RSS-only list ── */}
      {!hasNostrSources && hasRssSources && (
        <>
          {rssLoading && <RssSkeleton />}
          {!rssLoading && rssItems.length === 0 && (
            <Card className="border-dashed mx-4 my-8">
              <CardContent className="py-12 px-8 text-center">
                <p className="text-muted-foreground text-sm">
                  No articles found. Check the RSS URL is correct and try refreshing.
                </p>
              </CardContent>
            </Card>
          )}
          {rssItems.map((item) => (
            <RssItemCard key={item.id} item={item} />
          ))}
        </>
      )}

      {/* ── Mixed Nostr + RSS — interleaved in short mode ── */}
      {hasNostrSources && showMerged && (
        <>
          {isLoading && mergedTimeline.length === 0 && <FeedSkeleton />}
          {!isLoading && mergedTimeline.length === 0 && (
            <Card className="border-dashed mx-4 my-8">
              <CardContent className="py-12 px-8 text-center">
                <p className="text-muted-foreground text-sm">No posts yet.</p>
              </CardContent>
            </Card>
          )}
          {mergedTimeline.map((entry) =>
            entry.type === 'rss' ? (
              <RssItemCard key={entry.item.id} item={entry.item} />
            ) : (
              <ShortPostCard
                key={entry.event.id}
                event={entry.event}
                moderation={moderation?.canApprove(entry.event) ? { onApprove: () => void moderation.onApprove(entry.event) } : undefined}
              />
            ),
          )}
          {/* Infinite scroll sentinel for Nostr side */}
          {(hasNextPage || isFetchingNextPage) && (
            <div className="py-4 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchNextPage}
                disabled={isFetchingNextPage}
                className="text-muted-foreground"
              >
                {isFetchingNextPage ? (
                  <><RefreshCw size={13} className="animate-spin mr-2" />Loading…</>
                ) : (
                  'Load more'
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Nostr-only or non-short mode (media/audio/longform) ── */}
      {hasNostrSources && !showMerged && (
        <FeedView
          pages={nostrPages}
          mode={mode}
          isLoading={nostrLoading || isLoadingDvm}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          showLivestreamsAtTop={
            list.viewOptions?.showLivestreamsAtTop ??
            // Default to true for lists that are purely livestream sources
            list.sources.every((s) => s.type === 'livestream')
          }
          viewOptions={list.viewOptions}
          moderation={moderation}
        />
      )}

      <EditListDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={list}
        onSave={(updated) => updateSidebarList(list.id, updated)}
      />
    </div>
  );
}

function RssSkeleton() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-border flex gap-3">
          <Skeleton className="w-20 h-20 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FeedSkeleton() {
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
        </div>
      ))}
    </div>
  );
}
