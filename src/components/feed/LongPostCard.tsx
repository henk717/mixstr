import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronDown, ChevronUp, ArrowRight, CheckCircle } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Lightbox } from '@/components/ImageGallery';
import { cn } from '@/lib/utils';
import { PostAuthor } from './PostAuthor';
import { PostActions } from './PostActions';
import { RssAuthorHeader } from './RssAuthorHeader';
import { RssOpenRow } from './RssOpenRow';
import { NoteContent } from '@/components/NoteContent';
import { FeedImageGallery } from './FeedImageGallery';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { ReplyParentPreview, ReplyingToChip } from './ReplyContext';
import { RepostBanner } from './RepostBanner';
import { VideoWithVisibility } from '@/components/VideoWithVisibility';
import {
  extractImages,
  extractVideos,
  getEventTitle,
  getCoverImage,
  getSummary,
  isReply,
  isLongform,
  isLivestream,
  getLivestreamInfo,
  eventToNevent,
  getParentEventId,
  hasMedia as eventHasMedia,
} from '@/lib/postUtils';
import { isRssSyntheticEvent } from '@/lib/rssAdapter';
import { useTopComments } from '@/hooks/useEventComments';
import { useAuthor } from '@/hooks/useAuthor';
import { useParentEvent } from '@/hooks/useParentEvent';
import { useResolvedEvent } from '@/hooks/useResolvedEvent';
import { useIsVisible } from '@/hooks/useIsVisible';
import { useMuteList } from '@/hooks/useMuteList';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { AddrCoords } from '@/components/NoteContent';

interface LongPostCardProps {
  event: NostrEvent;
  /** Optional community moderation action. */
  moderation?: { onApprove: () => void };
}

/**
 * Long-view post card.
 *
 * Design intent:
 * - Shows full media immediately: images, videos, and external embeds
 *   (YouTube, Twitch, Spotify, etc.) are rendered inline without any
 *   collapse toggle.
 * - "Show more" only appears for extremely long *text-only* posts
 *   (content > 2000 chars with no media). Posts with media always show
 *   their full text alongside the media.
 * - Long-form articles (kind 30023) are shown as a rich card with cover
 *   image, title, summary, and full body.
 * - When the event is a reply, the parent post is shown above it
 *   (full post preview + full reply) instead of inline/without context.
 */
const TEXT_ONLY_CLAMP = 2000;

export function LongPostCard({ event, moderation }: LongPostCardProps) {
  const [textExpanded, setTextExpanded] = useState(false);
  const [coverLightboxOpen, setCoverLightboxOpen] = useState(false);
  const navigate = useNavigate();
  const { ref: actionsRef, isVisible: actionsVisible } = useIsVisible<HTMLDivElement>();
  const { ref: commentsRef, isVisible: commentsVisible } = useIsVisible<HTMLDivElement>();

  // Resolve repost/community-approval wrappers to the original event.
  const { event: displayEvent, wrapper } = useResolvedEvent(event);
  const nevent = eventToNevent(displayEvent);

  const reply = isReply(displayEvent);
  const parentRef = reply ? getParentEventId(displayEvent) : null;
  const { data: parentEvent, isPending: parentPending } = useParentEvent(parentRef);
  const { isMuted, isLoading: isBlocklistLoading } = useMuteList();
  const showParentPreview = parentEvent && !isMuted(parentEvent);
  const longform = isLongform(displayEvent);
  const title = getEventTitle(displayEvent);
  const cover = getCoverImage(displayEvent);
  const summary = getSummary(displayEvent);
  const isRss = isRssSyntheticEvent(displayEvent);

  const images = extractImages(displayEvent);
  const videos = extractVideos(displayEvent);
  const hasAnyMedia = eventHasMedia(displayEvent) || images.length > 0 || videos.length > 0;

  // Check if this is a livestream event and extract naddr coordinates
  const livestreamInfo = isLivestream(displayEvent) ? getLivestreamInfo(displayEvent) : null;
  const livestreamNaddr: AddrCoords | null = livestreamInfo
    ? {
        kind: 30311,
        pubkey: displayEvent.pubkey,
        identifier: livestreamInfo.dTag,
      }
    : null;

  // Only clamp text for extremely long text-only posts.
  // If the post has media, always show full text so context isn't cut off.
  const isVeryLong = displayEvent.content.length > TEXT_ONLY_CLAMP;
  const shouldClampText = isVeryLong && !hasAnyMedia && !textExpanded;

  const handleCardClick = () => {
    if (isRss) {
      const link = displayEvent.tags.find(([k]) => k === 'link')?.[1];
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(`/${livestreamNaddr ? nip19.naddrEncode(livestreamNaddr) : nevent}`);
  };

  return (
    <article
      className={cn(
        'border-b border-border hover:bg-accent/20 transition-colors cursor-pointer',
        reply && 'border-l-2 border-l-primary/30',
      )}
      onClick={handleCardClick}
    >
      {/* ── Repost / community approval banner ── */}
      {wrapper && (
        <RepostBanner wrapper={wrapper} className="px-4 pt-3 pb-0" />
      )}

      {/* ── Parent context (long view shows full parent preview above the reply) ── */}
      {reply && showParentPreview && (
        <ReplyParentPreview
          parent={parentEvent!}
          onParentClick={() => navigate(`/${eventToNevent(parentEvent!)}`)}
          className="pt-4"
        />
      )}
      {reply && parentRef && !showParentPreview && (
        <div className="pt-2 pb-0">
          <ReplyingToChip
            parentId={parentRef.id}
            parent={showParentPreview ? parentEvent : undefined}
            isPending={parentPending}
          />
        </div>
      )}

      <div className="px-4 py-5">
        {isRss ? (
          <RssAuthorHeader event={displayEvent} />
        ) : (
          <PostAuthor
            pubkey={displayEvent.pubkey}
            createdAt={displayEvent.created_at}
            hostPubkey={isLivestream(displayEvent) ? livestreamInfo?.hostPubkey : undefined}
          />
        )}

        <div className="mt-3 space-y-3">
          {longform ? (
            /* ── Long-form article (kind 30023) ── */
            <>
              <div className="rounded-xl border border-border overflow-hidden bg-card">
                {cover && (
                  <button
                    type="button"
                    className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="View cover image"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCoverLightboxOpen(true);
                    }}
                  >
                    <img
                      src={cover}
                      alt={title ?? 'Article'}
                      className="w-full h-52 object-cover hover:opacity-90 transition-opacity"
                      loading="lazy"
                    />
                  </button>
                )}
                <div className="p-4 space-y-2">
                  {title && (
                    <h2 className="font-bold text-base text-foreground leading-snug">{title}</h2>
                  )}
                  {summary && (
                    <p className="text-sm text-muted-foreground">{summary}</p>
                  )}
                  <NoteContent
                    event={displayEvent}
                    className={cn('text-sm leading-relaxed', shouldClampText && 'line-clamp-8')}
                    inlineExternalEmbeds
                  />
                  {shouldClampText && (
                    <button
                      className="text-xs text-primary flex items-center gap-1 hover:underline"
                      onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }}
                    >
                      <ChevronDown size={14} /> Read more
                    </button>
                  )}
                  {isVeryLong && textExpanded && (
                    <button
                      className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
                      onClick={(e) => { e.stopPropagation(); setTextExpanded(false); }}
                    >
                      <ChevronUp size={14} /> Show less
                    </button>
                  )}
                </div>
              </div>
              {cover && coverLightboxOpen && (
                <Lightbox
                  images={[cover]}
                  currentIndex={0}
                  onClose={() => setCoverLightboxOpen(false)}
                />
              )}
            </>
          ) : (
            /* ── Regular post ── */
            <>
              {/*
                NoteContent renders the text plus any inline nostr mentions/hashtags.
                Media (images, videos) are handled separately below so we can control
                their layout precisely — pass disableMediaEmbeds so NoteContent doesn't
                also try to render them, which would cause duplicates.
              */}
              <NoteContent
                event={displayEvent}
                className={cn('text-sm leading-relaxed', shouldClampText && 'line-clamp-8')}
                disableMediaEmbeds
                inlineExternalEmbeds
              />

              {shouldClampText && (
                <button
                  className="text-xs text-primary flex items-center gap-1 hover:underline"
                  onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }}
                >
                  <ChevronDown size={14} /> Show more
                </button>
              )}
              {isVeryLong && !hasAnyMedia && textExpanded && (
                <button
                  className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
                  onClick={(e) => { e.stopPropagation(); setTextExpanded(false); }}
                >
                  <ChevronUp size={14} /> Show less
                </button>
              )}

              {/* ── Images ── */}
              {images.length > 0 && <FeedImageGallery images={images} />}

{/* ── Videos ── */}
{videos.length > 0 && (
  <div className="rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
    <VideoWithVisibility src={videos[0]} />
  </div>
)}

              {/* ── Embedded livestream preview (if this is a livestream event) ── */}
              {livestreamNaddr && (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <EmbeddedNaddr addr={livestreamNaddr} className="my-2.5" />
                </div>
              )}

            </>
          )}
        </div>

        {/* Top 3 comments preview */}
        <div ref={commentsRef}>
          <CommentPreview eventId={displayEvent.id} nevent={nevent} enabled={commentsVisible} />
        </div>

        <div
          ref={actionsRef}
          className="mt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {isRss ? (
            <RssOpenRow event={displayEvent} />
          ) : actionsVisible ? (
            <PostActions event={displayEvent} enabled={actionsVisible} />
          ) : (
            <div className="h-6" aria-hidden="true" />
          )}
        </div>

        {moderation && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              onClick={moderation.onApprove}
              className="gap-1.5 h-7 text-xs bg-green-600 hover:bg-green-500 text-white"
            >
              <CheckCircle size={13} />
              Approve
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

function CommentPreview({ eventId, nevent, enabled = true }: { eventId: string; nevent: string; enabled?: boolean }) {
  const navigate = useNavigate();
  const { data: comments = [], isLoading: isCommentsLoading } = useTopComments(eventId, 3, enabled);
  const { isMuted, isLoading: isBlocklistLoading } = useMuteList();

  // Wait for both comments and blocklist to load
  const isLoading = isCommentsLoading || isBlocklistLoading;

  // Filter out comments from blocked users (only after blocklist loads)
  const filteredComments = isLoading ? [] : comments.filter((comment) => !isMuted(comment));

  if (isLoading) {
    return (
      <div className="mt-3 space-y-2 pl-3 border-l border-border/40">
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-2 items-start">
            <Skeleton className="w-6 h-6 rounded-full flex-shrink-0" />
            <Skeleton className="h-3 flex-1 mt-1.5" />
          </div>
        ))}
      </div>
    );
  }

  if (filteredComments.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 pl-3 border-l-2 border-border/40">
      {filteredComments.map((comment) => (
        <CommentPreviewItem key={comment.id} comment={comment} />
      ))}
      <button
        className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
        onClick={(e) => { e.stopPropagation(); navigate(`/${nevent}`); }}
      >
        <ArrowRight size={12} /> View all replies
      </button>
    </div>
  );
}

function CommentPreviewItem({ comment }: { comment: NostrEvent }) {
  const author = useAuthor(comment.pubkey);
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || comment.pubkey.slice(0, 8) + '…';
  const npub = nip19.npubEncode(comment.pubkey);

  return (
    <div className="flex gap-2 items-start" onClick={(e) => e.stopPropagation()}>
      <Link to={`/${npub}`} onClick={(e) => e.stopPropagation()}>
        <Avatar className="w-6 h-6 flex-shrink-0 mt-0.5">
          <AvatarImage src={meta?.picture} />
          <AvatarFallback className="text-[9px] bg-primary/20 text-primary font-bold">
            {displayName[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          to={`/${npub}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-semibold text-foreground/80 hover:text-primary transition-colors"
        >
          {displayName}
        </Link>
        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          <NoteContent event={comment} disableEmbeds disableMediaEmbeds disableNoteEmbeds />
        </div>
      </div>
    </div>
  );
}
