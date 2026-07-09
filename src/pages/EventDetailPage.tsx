import { useSeoMeta } from '@unhead/react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowLeft, MessageCircle, Repeat2, CheckCircle } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { PostAuthor } from '@/components/feed/PostAuthor';
import { PostActions } from '@/components/feed/PostActions';
import { NoteContent } from '@/components/NoteContent';
import { ReplyParentPreview, ReplyingToChip } from '@/components/feed/ReplyContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthor } from '@/hooks/useAuthor';
import { useEventById } from '@/hooks/useEventById';
import { useParentEvent } from '@/hooks/useParentEvent';
import { useMuteList } from '@/hooks/useMuteList';
import {
  getEventTitle,
  getCoverImage,
  getSummary,
  relativeTime,
  isLongform,
  isReply,
  isLivestream,
  getLivestreamInfo,
  getParentEventId,
  eventToNevent,
  tryExtractEmbeddedEvent,
  isCommunityApproval,
  findRelayHintForEvent,
} from '@/lib/postUtils';

interface EventDetailPageProps {
  eventId: string;
  pubkey?: string;
  /** For addressable events — the kind number (used with pubkey + d-tag) */
  kind?: number;
  /** Relay URLs from the NIP-19 identifier that are known to have this event. */
  relays?: string[];
}

export function EventDetailPage({ eventId, pubkey, kind, relays }: EventDetailPageProps) {
  const { data: outerEvent, isLoading } = useEventById({
    eventId,
    pubkey,
    kind,
    relayHints: relays,
    timeoutMs: 8000,
    staleTime: 5 * 60 * 1000,
  });

  // Reposts and community approvals wrap the real post as JSON in content.
  const event = outerEvent ? (tryExtractEmbeddedEvent(outerEvent) ?? outerEvent) : null;
  const wrapper = outerEvent && tryExtractEmbeddedEvent(outerEvent) ? outerEvent : null;

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

      {event && <EventDetailBody event={event} wrapper={wrapper} />}
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

function EventDetailBody({ event, wrapper }: { event: NostrEvent; wrapper?: NostrEvent | null }) {
  const navigate = useNavigate();
  const longform = isLongform(event);
  const title = getEventTitle(event);
  const cover = getCoverImage(event);
  const summary = getSummary(event);

  // Redirect to naddr for livestream events
  const isLive = isLivestream(event);
  const livestreamInfo = isLive ? getLivestreamInfo(event) : null;
  const livestreamNaddr = livestreamInfo?.dTag
    ? nip19.naddrEncode({ kind: 30311, pubkey: event.pubkey, identifier: livestreamInfo.dTag })
    : null;

  // Perform redirect for livestreams
  if (isLive && livestreamNaddr) {
    navigate(`/${livestreamNaddr}`, { replace: true });
    // Show minimal content while redirecting
    return (
      <div className="px-4 py-5 border-b border-border">
        <p className="text-sm text-muted-foreground">Redirecting to livestream page...</p>
      </div>
    );
  }

  const reply = isReply(event);
  const parentRef = reply ? getParentEventId(event) : null;
  const { data: parentEvent, isPending: parentPending } = useParentEvent(parentRef);
  const { isMuted, isLoading: isBlocklistLoading } = useMuteList();
  const showParentPreview = parentEvent && !isMuted(parentEvent);

  return (
    <>
      {/* Parent context above a reply */}
      {reply && parentRef && (
        <div className="border-b border-border">
          {showParentPreview ? (
            <ReplyParentPreview
              parent={parentEvent!}
              onParentClick={() =>
                navigate(`/${eventToNevent(parentEvent!, parentRef?.relay ? [parentRef.relay] : undefined)}`)
              }
            />
          ) : (
            <div className="pt-2 pb-0">
              <ReplyingToChip
                parentId={parentRef.id}
                parent={parentEvent && !isMuted(parentEvent) ? parentEvent : undefined}
                isPending={parentPending}
              />
            </div>
          )}
        </div>
      )}

      {/* Wrapper banner (repost / community approval) */}
      {wrapper && (
        <div className="px-4 pt-3 pb-0 border-b border-border">
          <WrapperBanner wrapper={wrapper} />
        </div>
      )}

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
                <NoteContent event={event} inlineExternalEmbeds />
              </div>
            </>
          ) : (
            <NoteContent event={event} className="text-sm leading-relaxed" inlineExternalEmbeds />
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

function WrapperBanner({ wrapper }: { wrapper: NostrEvent }) {
  const author = useAuthor(wrapper.pubkey);
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const name = rawName.trim() || wrapper.pubkey.slice(0, 10) + '…';
  const isApproval = isCommunityApproval(wrapper);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-[54px]">
      {isApproval ? <CheckCircle size={13} /> : <Repeat2 size={13} />}
      <Link
        to={`/${eventToNevent(wrapper)}`}
        onClick={(e) => e.stopPropagation()}
        className="hover:underline"
      >
        {name}
      </Link>
      <span>{isApproval ? 'approved this post' : 'reposted this post'}</span>
    </div>
  );
}

function AllReplies({ eventId }: { eventId: string }) {
  const { nostr } = useNostr();
  const { isMuted, isLoading: isBlocklistLoading } = useMuteList();

  const { data: replies = [], isLoading: isRepliesLoading } = useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'all-replies', eventId],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [1], '#e': [eventId], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      // Filter out replies from blocked users
      const filtered = events.filter((event) => !isMuted(event));
      return filtered.sort((a, b) => a.created_at - b.created_at);
    },
    staleTime: 60 * 1000,
  });

  // Wait for both the blocklist and replies to load before displaying
  const isLoading = isBlocklistLoading || isRepliesLoading;

  // Also filter out replies where the reply itself is a reply to a blocked user
  const filteredReplies = replies.filter((reply) => {
    const replyToEventId = reply.tags.find((tag) => tag[0] === 'e' && tag[1])?.[1];
    if (!replyToEventId) return true;
    // Check if any 'p' tag in the reply points to a blocked user
    const replyToAuthor = reply.tags.find((tag) => tag[0] === 'p')?.[1];
    if (replyToAuthor) {
      const dummyEvent = { pubkey: replyToAuthor, content: '', tags: [], id: '', created_at: 0, sig: '' } as NostrEvent;
      return !isMuted(dummyEvent);
    }
    return true;
  });

  // Only show replies after blocklist has loaded
  const displayReplies = isLoading ? [] : filteredReplies;

  return (
    <div>
      <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
        <MessageCircle size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          {isLoading ? 'Loading replies…' : `${displayReplies.length} ${displayReplies.length === 1 ? 'reply' : 'replies'}`}
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

      {!isLoading && displayReplies.length === 0 && (
        <Card className="border-dashed mx-4 my-6">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No replies yet. Be the first to reply!
          </CardContent>
        </Card>
      )}

      {displayReplies.map((reply) => (
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
  const npub = nip19.npubEncode(reply.pubkey);

  return (
    <div className="flex gap-3 px-4 py-4 border-b border-border hover:bg-accent/20 transition-colors">
      <Link to={`/${npub}`} onClick={(e) => e.stopPropagation()}>
        <Avatar className="w-9 h-9 flex-shrink-0 mt-0.5">
          <AvatarImage src={meta?.picture} />
          <AvatarFallback className="text-xs bg-primary/20 text-primary font-bold">
            {displayName[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            to={`/${npub}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            {displayName}
          </Link>
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
