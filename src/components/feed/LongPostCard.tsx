import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronDown, ChevronUp, MessageCircle, ArrowRight } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';
import { PostAuthor } from './PostAuthor';
import { PostActions } from './PostActions';
import { NoteContent } from './NoteContent';
import {
  extractImages,
  extractVideos,
  extractExternalEmbeds,
  getEventTitle,
  getCoverImage,
  getSummary,
  isReply,
  isLongform,
  eventToNevent,
} from '@/lib/postUtils';
import { useTopComments } from '@/hooks/useEventComments';
import { useAuthor } from '@/hooks/useAuthor';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

interface LongPostCardProps {
  event: NostrEvent;
}

const TRUNCATE_LENGTH = 800;

export function LongPostCard({ event }: LongPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const nevent = eventToNevent(event);

  const isVeryLong = event.content.length > TRUNCATE_LENGTH;
  const images = extractImages(event);
  const videos = extractVideos(event);
  const embeds = extractExternalEmbeds(event);
  const reply = isReply(event);
  const longform = isLongform(event);
  const title = getEventTitle(event);
  const cover = getCoverImage(event);
  const summary = getSummary(event);

  const displayContent = isVeryLong && !expanded
    ? event.content.slice(0, TRUNCATE_LENGTH)
    : event.content;

  const handleCardClick = () => {
    navigate(`/${nevent}`);
  };

  return (
    <article
      className={cn(
        'px-4 py-5 border-b border-border hover:bg-accent/20 transition-colors cursor-pointer',
        reply && 'border-l-2 border-l-primary/30',
      )}
      onClick={handleCardClick}
    >
      <PostAuthor pubkey={event.pubkey} createdAt={event.created_at} />

      <div className="mt-3 space-y-3">
        {longform ? (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            {cover && (
              <img
                src={cover}
                alt={title ?? 'Article'}
                className="w-full h-48 object-cover"
                loading="lazy"
              />
            )}
            <div className="p-4">
              {title && (
                <h2 className="font-bold text-base text-foreground mb-2 leading-snug">
                  {title}
                </h2>
              )}
              {summary && (
                <p className="text-sm text-muted-foreground mb-2">{summary}</p>
              )}
              <NoteContent content={displayContent} />
              {isVeryLong && !expanded && (
                <button
                  className="text-xs text-primary mt-2 flex items-center gap-1 hover:underline"
                  onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                >
                  <ChevronDown size={14} /> Read more
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <NoteContent content={displayContent} />

            {isVeryLong && !expanded && (
              <button
                className="text-xs text-primary flex items-center gap-1 hover:underline"
                onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              >
                <ChevronDown size={14} /> Show more
              </button>
            )}
            {isVeryLong && expanded && (
              <button
                className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
                onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              >
                <ChevronUp size={14} /> Show less
              </button>
            )}

            {images.length > 0 && (
              <div className={cn('grid gap-1 rounded-xl overflow-hidden', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                {images.slice(0, 4).map((url, i) => (
                  <img key={i} src={url} alt="" className="w-full object-cover aspect-video" loading="lazy"
                    onClick={(e) => e.stopPropagation()} />
                ))}
              </div>
            )}

            {videos.length > 0 && (
              <div className="rounded-xl overflow-hidden">
                <video src={videos[0]} controls className="w-full max-h-96 object-contain bg-black"
                  onClick={(e) => e.stopPropagation()} />
              </div>
            )}

            {/* External embeds (YouTube, Spotify, etc.) */}
            {embeds.slice(0, 1).map((embed) => (
              <div key={embed.url} className="rounded-xl overflow-hidden border border-border aspect-video"
                onClick={(e) => e.stopPropagation()}>
                <iframe
                  src={embed.embedUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  title={embed.label}
                />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Top 3 comments preview */}
      <CommentPreview eventId={event.id} nevent={nevent} />

      <div className="mt-3">
        <PostActions eventId={event.id} />
      </div>
    </article>
  );
}

function CommentPreview({ eventId, nevent }: { eventId: string; nevent: string }) {
  const navigate = useNavigate();
  const { data: comments = [], isLoading } = useTopComments(eventId, 3, true);

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

  if (comments.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 pl-3 border-l-2 border-border/40">
      {comments.map((comment) => (
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

  return (
    <div className="flex gap-2 items-start" onClick={(e) => e.stopPropagation()}>
      <Avatar className="w-6 h-6 flex-shrink-0 mt-0.5">
        <AvatarImage src={meta?.picture} />
        <AvatarFallback className="text-[9px] bg-primary/20 text-primary font-bold">
          {displayName[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <span className="text-xs font-semibold text-foreground/80">{displayName} </span>
        <span className="text-xs text-muted-foreground line-clamp-2">{comment.content}</span>
      </div>
    </div>
  );
}
