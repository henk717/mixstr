import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { RefreshCw, Pencil } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMixstr } from '@/hooks/useMixstr';
import { useListFeed } from '@/hooks/useListFeed';
import { useRssFeed } from '@/hooks/useRssFeed';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCommunityMetas, isModeratorOf } from '@/hooks/useCommunity';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { ListIcon } from '@/components/layout/ListIcon';
import { EditListDialog } from '@/components/layout/EditListDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sourceDescription } from '@/lib/sidebarLists';
import { tryExtractEmbeddedEvent } from '@/lib/postUtils';
import { rssItemsToSyntheticEvents } from '@/lib/rssAdapter';
import type { NostrEvent } from '@nostrify/nostrify';

export function ListFeedPage() {
  const { id } = useParams<{ id: string }>();
  const { sidebarLists, updateSidebarList, feedViewModes, setFeedViewMode } = useMixstr();
  const [editOpen, setEditOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const rssEvents = useMemo(
    () => rssItemsToSyntheticEvents(rssItems),
    [rssItems],
  );

  // For lists with RSS sources we merge and re-sort chronologically so RSS
  // items appear in longform / media / audio modes alongside Nostr posts.
  const mergedEvents = useMemo<NostrEvent[]>(() => {
    if (rssEvents.length === 0) return allNostrEvents;
    const seen = new Set<string>();
    const out: NostrEvent[] = [];
    for (const event of [...allNostrEvents, ...rssEvents]) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      out.push(event);
    }
    return out.sort((a, b) => b.created_at - a.created_at);
  }, [allNostrEvents, rssEvents]);

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

        {/* View mode switcher — available for any list that can produce content */}
        {list.sources.length > 0 && (
          <div className="px-4 pb-3">
            <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
          </div>
        )}
      </div>

      <FeedView
        events={mergedEvents}
        mode={mode}
        isLoading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}

        viewOptions={list.viewOptions}
        moderation={moderation}
        emptyMessage={
          hasRssSources && !hasNostrSources
            ? 'No articles found. Check the RSS URL is correct and try refreshing.'
            : 'No posts yet. Follow some people or wait for content to load.'
        }
      />

      <EditListDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={list}
        onSave={(updated) => updateSidebarList(list.id, updated)}
      />
    </div>
  );
}



