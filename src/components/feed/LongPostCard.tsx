import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronDown, ChevronUp, MessageCircle, Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostAuthor } from './PostAuthor';
import { PostActions } from './PostActions';
import { NoteContent } from './NoteContent';
import {
  extractImages,
  extractVideos,
  getEventTitle,
  getCoverImage,
  getSummary,
  isReply,
  isLongform,
} from '@/lib/postUtils';

interface LongPostCardProps {
  event: NostrEvent;
  onClick?: () => void;
}

const TRUNCATE_LENGTH = 800;

export function LongPostCard({ event, onClick }: LongPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isVeryLong = event.content.length > TRUNCATE_LENGTH;
  const images = extractImages(event);
  const videos = extractVideos(event);
  const reply = isReply(event);
  const longform = isLongform(event);
  const title = getEventTitle(event);
  const cover = getCoverImage(event);
  const summary = getSummary(event);

  const displayContent = isVeryLong && !expanded
    ? event.content.slice(0, TRUNCATE_LENGTH)
    : event.content;

  return (
    <article
      className={cn(
        'px-4 py-5 border-b border-border hover:bg-accent/20 transition-colors cursor-pointer',
        reply && 'border-l-2 border-l-primary/30',
      )}
      onClick={onClick}
    >
      <PostAuthor pubkey={event.pubkey} createdAt={event.created_at} />

      <div className="mt-3 space-y-3">
        {/* Long-form: full article preview */}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(true);
                  }}
                >
                  <ChevronDown size={14} /> Read more
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Normal post - full or near-full content */}
            <NoteContent content={displayContent} />

            {isVeryLong && !expanded && (
              <button
                className="text-xs text-primary flex items-center gap-1 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
              >
                <ChevronDown size={14} /> Show more
              </button>
            )}
            {isVeryLong && expanded && (
              <button
                className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
              >
                <ChevronUp size={14} /> Show less
              </button>
            )}

            {/* Media */}
            {images.length > 0 && (
              <div className={cn('grid gap-1 rounded-xl overflow-hidden', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                {images.slice(0, 4).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="w-full object-cover aspect-video"
                    loading="lazy"
                    onClick={(e) => e.stopPropagation()}
                  />
                ))}
              </div>
            )}

            {videos.length > 0 && (
              <div className="rounded-xl overflow-hidden">
                <video
                  src={videos[0]}
                  controls
                  className="w-full max-h-96 object-contain bg-black"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Popular comments preview (placeholder - in a real app query replies) */}
      <div className="mt-3 pl-3 border-l border-border/50 space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MessageCircle size={11} />
          View replies
        </p>
      </div>

      <div className="mt-3">
        <PostActions eventId={event.id} />
      </div>
    </article>
  );
}
