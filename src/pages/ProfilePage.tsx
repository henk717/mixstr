import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useAuthor } from '@/hooks/useAuthor';
import { useMixstr } from '@/hooks/useMixstr';
import { useProfileFeed } from '@/hooks/useProfileFeed';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Globe, RefreshCw } from 'lucide-react';

interface ProfilePageProps {
  pubkey: string;
}

export function ProfilePage({ pubkey }: ProfilePageProps) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  const { feedViewModes, setFeedViewMode } = useMixstr();
  const feedKey = `profile:${pubkey}`;
  const mode = feedViewModes[feedKey] ?? 'short';

  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || pubkey.slice(0, 16) + '…';

  useSeoMeta({ title: `${displayName} · Mixstr` });

  const {
    events,
    isLoading: feedLoading,
    isFetchingOlder,
    hasMore,
    fetchNextPage,
  } = useProfileFeed(pubkey);

  // Wrap into pages[] shape that FeedView expects
  const pages = useMemo(() => (events.length > 0 ? [events] : []), [events]);

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

      {/* Feed toolbar */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-2 flex items-center gap-2">
          <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
          {/* Live poll indicator */}
          {!feedLoading && (
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground select-none">
              <RefreshCw size={10} className="animate-spin opacity-60" />
              <span>Live</span>
              {events.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                  {events.length}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <FeedView
        pages={pages}
        mode={mode}
        isLoading={feedLoading}
        hasNextPage={hasMore}
        isFetchingNextPage={isFetchingOlder}
        fetchNextPage={fetchNextPage}
      />
    </div>
  );
}
