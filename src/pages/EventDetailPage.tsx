import { useSeoMeta } from '@unhead/react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { PostAuthor } from '@/components/feed/PostAuthor';
import { PostActions } from '@/components/feed/PostActions';
import { NoteContent } from '@/components/NoteContent';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthor } from '@/hooks/useAuthor';
import {
  getEventTitle,
  getCoverImage,
  getSummary,
  isLongform,
  relativeTime,
} from '@/lib/postUtils';

interface EventDetailPageProps {
  eventId: string;
  pubkey?: string;
  /** For addressable events — the kind number (used with pubkey + d-tag) */
  kind?: number;
}

export function EventDetailPage({ eventId, pubkey, kind }: EventDetailPageProps) {
  const { nostr } = useNostr();

  const { data: event, isLoading } = useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'event-detail', eventId, pubkey ?? '', kind ?? 0],
    queryFn: async ({ signal }) => {
      let filter;
      if (kind && pubkey) {
        // Addressable event: query by kind + author + d-tag
        filter = [{ kinds: [kind], authors: [pubkey], '#d': [eventId], limit: 1 }];
      } else if (pubkey) {
        filter = [{ ids: [eventId], authors: [pubkey], limit: 1 }];
      } else {
        filter = [{ ids: [eventId], limit: 1 }];
      }
      const [ev] = await nostr.query(filter, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      return ev ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  useSeoMeta({
    title: event
      ? `${getEventTitle(event) ?? event.content.slice(0, 50)} · Mixstr`
      : 'Post · Mixstr',
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <BackButton />
          <h1 className="text-base font-bold">Post</h1>
        </div>
      </div>

      {isLoading && <EventDetailSkeleton />}

      {!isLoading && !event && (
        <Card className="border-dashed mx-4 my-8">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Post not found or could not be loaded.
          </CardContent>
        </Card>
      )}

      {event && <EventDetailBody event={event} />}
    </div>
  );
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => navigate(-1)}>
      <ArrowLeft size={18} />
    </Button>
  );
}

function EventDetailBody({ event }: { event: NostrEvent }) {
  const longform = isLongform(event);
  const title = getEventTitle(event);
  const cover = getCoverImage(event);
  const summary = getSummary(event);

  return (
    <>
      {/* Main post */}
      <div className="px-4 py-5 border-b border-border">
        <PostAuthor pubkey={event.pubkey} createdAt={event.created_at} />

        <div className="mt-3 space-y-3">
          {longform ? (
            <>
              {cover && (
                <img src={cover} alt={title} className="w-full rounded-xl object-cover max-h-80" loading="lazy" />
              )}
              {title && <h1 className="text-xl font-bold text-foreground leading-snug">{title}</h1>}
              {summary && <p className="text-sm text-muted-foreground italic">{summary}</p>}
              <div className="prose prose-invert prose-sm max-w-none">
                <NoteContent event={event} />
              </div>
            </>
          ) : (
            <NoteContent event={event} className="text-sm leading-relaxed" />
          )}
        </div>

        {/* Full timestamp */}
        <p className="text-xs text-muted-foreground mt-4">
          {new Date(event.created_at * 1000).toLocaleString()}
        </p>

        <div className="mt-3 pt-3 border-t border-border">
          <PostActions event={event} />
        </div>
      </div>

      {/* All replies */}
      <AllReplies eventId={event.id} />
    </>
  );
}

function AllReplies({ eventId }: { eventId: string }) {
  const { nostr } = useNostr();

  const { data: replies = [], isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'all-replies', eventId],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [1], '#e': [eventId], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return events.sort((a, b) => a.created_at - b.created_at);
    },
    staleTime: 60 * 1000,
  });

  return (
    <div>
      <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
        <MessageCircle size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          {isLoading ? 'Loading replies…' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
        </h2>
      </div>

      {isLoading && (
        <div className="space-y-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 px-4 py-4 border-b border-border">
              <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && replies.length === 0 && (
        <Card className="border-dashed mx-4 my-6">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No replies yet. Be the first to reply!
          </CardContent>
        </Card>
      )}

      {replies.map((reply) => (
        <ReplyItem key={reply.id} reply={reply} />
      ))}
    </div>
  );
}

function ReplyItem({ reply }: { reply: NostrEvent }) {
  const author = useAuthor(reply.pubkey);
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || reply.pubkey.slice(0, 10) + '…';

  return (
    <div className="flex gap-3 px-4 py-4 border-b border-border hover:bg-accent/20 transition-colors">
      <Avatar className="w-9 h-9 flex-shrink-0 mt-0.5">
        <AvatarImage src={meta?.picture} />
        <AvatarFallback className="text-xs bg-primary/20 text-primary font-bold">
          {displayName[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{displayName}</span>
          <span className="text-xs text-muted-foreground">{relativeTime(reply.created_at)}</span>
        </div>
        <div className="mt-1">
          <NoteContent event={reply} className="text-sm" />
        </div>
        <div className="mt-2">
          <PostActions event={reply} compact />
        </div>
      </div>
    </div>
  );
}

function EventDetailSkeleton() {
  return (
    <div className="px-4 py-5 border-b border-border space-y-4">
      <div className="flex gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
