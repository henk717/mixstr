import { useSeoMeta } from '@unhead/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthor } from '@/hooks/useAuthor';
import { LoginArea } from '@/components/auth/LoginArea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Heart, Repeat2, MessageCircle, Zap, Bell } from 'lucide-react';
import { relativeTime } from '@/lib/postUtils';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';

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
    default: return 'replied to you';
  }
}

function NotificationItem({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(event.pubkey);
  const displayName = meta?.display_name ?? meta?.name ?? event.pubkey.slice(0, 10) + '…';

  return (
    <div className="flex items-start gap-3 px-4 py-4 border-b border-border hover:bg-accent/20 transition-colors">
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link to={`/${npub}`} className="font-semibold text-sm hover:text-primary transition-colors">
            {displayName}
          </Link>
          <span className="text-sm text-muted-foreground">{kindLabel(event.kind)}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {relativeTime(event.created_at)}
          </span>
        </div>
        {event.content && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {event.content}
          </p>
        )}
      </div>
    </div>
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

      {!isLoading && notifications.map((event) => (
        <NotificationItem key={event.id} event={event} />
      ))}
    </div>
  );
}
