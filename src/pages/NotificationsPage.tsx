import { useSeoMeta } from '@unhead/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthor } from '@/hooks/useAuthor';
import { useNostr } from '@nostrify/react';
import { useQueries } from '@tanstack/react-query';
import { LoginArea } from '@/components/auth/LoginArea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Heart, Repeat2, MessageCircle, Zap, Bell } from 'lucide-react';
import { relativeTime } from '@/lib/postUtils';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';

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

/** Looks up the event ID that was referenced (the post being replied/reacted to) */
function getReferencedEventId(event: NostrEvent): string | null {
  // For kind 9735 zaps, 'e' tag points to the zapped event
  // For kind 7 reactions and kind 1 replies, 'e' tag points to the referenced post
  // Use the last 'e' tag (by convention the root is first, reply target is last)
  const eTags = event.tags.filter(([t]) => t === 'e');
  if (eTags.length === 0) return null;
  return eTags[eTags.length - 1][1] ?? null;
}

function NotificationItem({
  event,
  referencedEvent,
}: {
  event: NostrEvent;
  referencedEvent?: NostrEvent | null;
}) {
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(event.pubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || event.pubkey.slice(0, 10) + '…';

  // For replies: show the reply text (event.content)
  // For reactions: show "+" or the reaction content
  // For reposts: no content to show typically
  const showReplyContent = event.kind === 1 && event.content.trim().length > 0;
  const showReactionContent = event.kind === 7 && event.content !== '+' && event.content.trim().length > 0;

  // The original post snippet to show as context
  const originalContent = referencedEvent?.content?.trim();

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-4 border-b border-border border-l-2 hover:bg-accent/10 transition-colors',
        kindBg(event.kind),
      )}
    >
      {/* Avatar with action badge */}
      <div className="relative flex-shrink-0">
        <Link to={`/${npub}`}>
          <Avatar className="w-10 h-10">
            <AvatarImage src={meta?.picture} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
              {displayName[0].toUpperCase()}
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
          <Link to={`/${npub}`} className="font-semibold text-sm hover:text-primary transition-colors">
            {displayName}
          </Link>
          <span className="text-sm text-muted-foreground">{kindLabel(event.kind)}</span>
          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
            {relativeTime(event.created_at)}
          </span>
        </div>

        {/* The reply content (what THEY wrote) */}
        {showReplyContent && (
          <p className="text-sm text-foreground mt-1.5 leading-snug line-clamp-3">
            {event.content}
          </p>
        )}

        {/* Reaction emoji if non-standard */}
        {showReactionContent && (
          <p className="text-sm text-foreground mt-1">{event.content}</p>
        )}

        {/* Original post context */}
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

  // Collect all referenced event IDs
  const refIds = notifications
    .map(getReferencedEventId)
    .filter((id): id is string => id !== null);

  // Batch-fetch all referenced events in one query
  const refQuery = useQueries({
    queries: refIds.length > 0 ? [{
      queryKey: ['nostr', 'ref-events', refIds.sort().join(',')],
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
  const { data: notifications = [], isLoading } = useNotifications();

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

      {!isLoading && notifications.length === 0 && (
        <Card className="border-dashed mx-4 my-8">
          <CardContent className="py-12 px-8 text-center">
            <Bell size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              No notifications yet. When people react, reply, or zap your posts, they'll appear here.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && notifications.length > 0 && (
        <NotificationsWithContext notifications={notifications} />
      )}
    </div>
  );
}
