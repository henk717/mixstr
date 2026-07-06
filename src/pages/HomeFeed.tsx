import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowing } from '@/hooks/useFollowing';
import { useFollowingFeed } from '@/hooks/useFollowingFeed';
import { useMixstr } from '@/hooks/useMixstr';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { ComposeDialog } from '@/components/feed/ComposeDialog';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { RefreshCw, Feather, Pencil } from 'lucide-react';

const FEED_KEY = 'home';

export function HomeFeed() {
  useSeoMeta({ title: 'Home · Mixstr', description: 'Your Nostr following feed' });

  const { user, metadata } = useCurrentUser();
  const { data: following = [], isLoading: followingLoading } = useFollowing();
  const {
    data,
    isLoading: feedLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useFollowingFeed();

  const { feedViewModes, setFeedViewMode } = useMixstr();
  const mode = feedViewModes[FEED_KEY] ?? 'short';
  const pages = useMemo(() => data?.pages ?? [], [data]);
  const isLoading = followingLoading || feedLoading;

  const [composeOpen, setComposeOpen] = useState(false);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-black text-foreground">
            Mix<span className="text-primary">str</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-sm">
            A Nostr client built for the open social web. Log in to see your feed.
          </p>
        </div>
        <LoginArea className="max-w-64" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto relative">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-foreground">Home</h1>
          <div className="flex items-center gap-1">
            {/* New post button in header */}
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-primary hover:bg-primary/10"
              onClick={() => setComposeOpen(true)}
              title="New post"
            >
              <Pencil size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-primary"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
        <div className="px-4 pb-3">
          <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(FEED_KEY, m)} />
        </div>
      </div>

      {/* Compose hint — clickable to open dialog */}
      <div
        className="px-4 py-3 border-b border-border flex items-center gap-3 cursor-pointer group"
        onClick={() => setComposeOpen(true)}
      >
        <div className="w-9 h-9 rounded-full overflow-hidden bg-primary/20 flex-shrink-0">
          {metadata?.picture ? (
            <img src={metadata.picture} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-primary text-xs font-bold">
              {(metadata?.name?.trim() || metadata?.display_name?.trim() || 'U')[0].toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 text-left text-muted-foreground text-sm py-2 px-3 rounded-full border border-border group-hover:border-primary/50 group-hover:text-foreground transition-colors bg-muted/30">
          What's on your mind?
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="text-primary hover:bg-primary/10 w-8 h-8 rounded-full flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); setComposeOpen(true); }}
          title="New post"
        >
          <Feather size={16} />
        </Button>
      </div>

      {/* Feed */}
      <FeedView
        pages={pages}
        mode={mode}
        isLoading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />

       {!isLoading && following.length === 0 && (
         <div className="px-4 py-6 text-center text-sm text-muted-foreground">
           You're not following anyone yet. Find people to follow to populate your feed.
         </div>
       )}

       {/* Compose dialog */}
       <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} />
     </div>
   );
 }
