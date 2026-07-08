import { useSeoMeta } from '@unhead/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthor } from '@/hooks/useAuthor';
import { useMuteList } from '@/hooks/useMuteList';
import { useMixstr } from '@/hooks/useMixstr';
import { useNostr } from '@nostrify/react';
import { useQueries } from '@tanstack/react-query';
import { LoginArea } from '@/components/auth/LoginArea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Heart, Repeat2, MessageCircle, Zap, Bell, RefreshCw } from 'lucide-react';
import { relativeTime } from '@/lib/postUtils';
import { nip19 } from 'nostr-tools';
import { Link, useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';
import { EmojifiedText } from '@/components/CustomEmoji';

function kindIcon(kind: number) {
  switch (kind) {
    case 7: return <Heart size={14} className="text-pink-400" />;
    case 6: return <Repeat2 size={14} className="text-green-400" />;
    case 9735: return <Zap size={14} className="text-yellow-400" />;
    default: return <MessageCircle size={14} className="text-blue-400" />;
  }
}

function kindLabel(kind: number) {
  switch (kind) {
    case 7: return 'reacted to your post';
    case 6: return 'reposted your post';
    case 9735: return 'zapped you';
    default: return 'replied to your post';
  }
}

function kindBg(kind: number) {
  switch (kind) {
    case 7: return 'border-l-pink-400/50 bg-pink-400/5';
    case 6: return 'border-l-green-400/50 bg-green-400/5';
    case 9735: return 'border-l-yellow-400/50 bg-yellow-400/5';
    default: return 'border-l-blue-400/50 bg-blue-400/5';
  }
}

/** The last 'e' tag is the most specific reference (reply target or reacted post) */
function getReferencedEventId(event: NostrEvent): string | null {
  const eTags = event.tags.filter(([t]) => t === 'e');
  if (eTags.length === 0) return null;
  return eTags[eTags.length - 1][1] ?? null;
}

/**
 * Decide where clicking a notification should navigate.
 *  - Reply (kind 1): go to the reply itself
 *  - Reaction/repost/zap: go to the original post that was reacted to
 */
function notificationTarget(event: NostrEvent, referencedEvent: NostrEvent | null | undefined): string | null {
  if (event.kind === 1) {
    // Go to the reply itself
    try {
      return '/' + nip19.neventEncode({ id: event.id, author: event.pubkey, kind: 1 });
    } catch {
      return null;
    }
  }
  // For reactions/reposts/zaps, go to the post that was acted on
  if (referencedEvent) {
    try {
      return '/' + nip19.neventEncode({ id: referencedEvent.id, author: referencedEvent.pubkey, kind: referencedEvent.kind });
    } catch {
      return null;
    }
  }
  // Fall back to the notification event itself
  const refId = getReferencedEventId(event);
  if (refId) {
    try {
      return '/' + nip19.neventEncode({ id: refId, kind: 1 });
    } catch {
      return '/' + refId;
    }
  }
  return null;
}

function NotificationItem({
  event,
  referencedEvent,
}: {
  event: NostrEvent;
  referencedEvent?: NostrEvent | null;
}) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const authorEvent = author.data?.event;
  const npub = nip19.npubEncode(event.pubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || event.pubkey.slice(0, 10) + '…';
  const avatarInitial = displayName[0]?.toUpperCase() || event.pubkey.slice(0, 1).toUpperCase();

  const showReplyContent = event.kind === 1 && event.content.trim().length > 0;
  const showReactionContent = event.kind === 7 && event.content !== '+' && event.content.trim().length > 0;
  const originalContent = referencedEvent?.content?.trim();

  const target = notificationTarget(event, referencedEvent);

  const handleRowClick = () => {
    if (target) navigate(target);
  };

  return (
    <div
      role={target ? 'button' : undefined}
      tabIndex={target ? 0 : undefined}
      onKeyDown={target ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleRowClick(); } : undefined}
      onClick={target ? handleRowClick : undefined}
      className={cn(
        'flex items-start gap-3 px-4 py-4 border-b border-border border-l-2 transition-colors',
        kindBg(event.kind),
        target && 'cursor-pointer hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      {/* Avatar with action badge */}
      <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <Link to={`/${npub}`}>
          <Avatar className="w-10 h-10">
            <AvatarImage src={meta?.picture} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
              {avatarInitial}
            </AvatarFallback>
          </Avatar>
        </Link>
        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center">
          {kindIcon(event.kind)}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        {/* Who did what */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link
            to={`/${npub}`}
            className="font-semibold text-sm hover:text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {authorEvent ? (
              <EmojifiedText tags={authorEvent.tags}>{displayName}</EmojifiedText>
            ) : displayName}
          </Link>
          <span className="text-sm text-muted-foreground">{kindLabel(event.kind)}</span>
          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
            {relativeTime(event.created_at)}
          </span>
        </div>

        {/* Reply content */}
        {showReplyContent && (
          <p className="text-sm text-foreground mt-1.5 leading-snug line-clamp-3">
            {event.content}
          </p>
        )}

        {/* Reaction emoji if non-standard */}
        {showReactionContent && (
          <p className="text-sm text-foreground mt-1">{event.content}</p>
        )}

        {/* Original post context — also clickable */}
        {originalContent && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-muted/60 border border-border/60 text-xs text-muted-foreground line-clamp-2">
            {originalContent}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsWithContext({ notifications }: { notifications: NostrEvent[] }) {
  const { nostr } = useNostr();

  const refIds = notifications
    .map(getReferencedEventId)
    .filter((id): id is string => id !== null);

  const refQuery = useQueries({
    queries: refIds.length > 0 ? [{
      queryKey: ['nostr', 'ref-events', refIds.slice().sort().join(',')],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const events = await nostr.query(
          [{ ids: refIds, limit: refIds.length }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
        );
        const map = new Map<string, NostrEvent>();
        for (const ev of events) map.set(ev.id, ev);
        return map;
      },
      staleTime: 5 * 60 * 1000,
    }] : [],
  });

  const refMap: Map<string, NostrEvent> = refQuery[0]?.data ?? new Map();

  return (
    <>
      {notifications.map((event) => {
        const refId = getReferencedEventId(event);
        const referencedEvent = refId ? refMap.get(refId) ?? null : null;
        return (
          <NotificationItem
            key={event.id}
            event={event}
            referencedEvent={referencedEvent}
          />
        );
      })}
    </>
  );
}

export function NotificationsPage() {
  useSeoMeta({ title: 'Notifications · Mixstr' });
  const { user } = useCurrentUser();
  const { data: notifications = [], isLoading: isNotificationsLoading, refetch, isFetching } = useNotifications();
  const { isMuted, isLoading: isBlocklistLoading } = useMuteList();
  const { setLastNotificationReadAt } = useMixstr();
  
  // Mark notifications as read when the page is opened
  useEffect(() => {
    if (user) {
      const now = Math.floor(Date.now() / 1000);
      setLastNotificationReadAt(now);
    }
  }, [user, setLastNotificationReadAt]);

  // Wait for both notifications and blocklist to load
  const isLoading = isNotificationsLoading || isBlocklistLoading;

  // Filter out notifications from blocked users (only after blocklist loads)
  const filteredNotifications = isLoading ? [] : notifications.filter((event) => !isMuted(event));

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <Bell size={40} className="text-muted-foreground" />
        <p className="text-muted-foreground">Log in to see your notifications.</p>
        <LoginArea className="max-w-64" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-4 flex items-center gap-2">
          <Bell size={20} className="text-primary" />
          <h1 className="text-lg font-bold">Notifications</h1>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 ml-auto text-muted-foreground hover:text-primary"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-4 border-b border-border">
              <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && filteredNotifications.length === 0 && (
        <Card className="border-dashed mx-4 my-8">
          <CardContent className="py-12 px-8 text-center">
            <Bell size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              No notifications yet. When people react, reply, or zap your posts, they'll appear here.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && filteredNotifications.length > 0 && (
        <NotificationsWithContext notifications={filteredNotifications} />
      )}
    </div>
  );
}
