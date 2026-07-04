import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronDown, ChevronUp, Repeat2 } from 'lucide-react';
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
  isRepost,
  isLongform,
} from '@/lib/postUtils';
import { useAuthor } from '@/hooks/useAuthor';

interface ShortPostCardProps {
  event: NostrEvent;
  onClick?: () => void;
}

export function ShortPostCard({ event, onClick }: ShortPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = event.content.length > 280;
  const images = extractImages(event);
  const videos = extractVideos(event);
  const reply = isReply(event);
  const repost = isRepost(event);
  const longform = isLongform(event);
  const title = getEventTitle(event);
  const cover = getCoverImage(event);
  const summary = getSummary(event);

  // For reposts, show the referenced event id
  const repostedId = repost
    ? event.tags.find(([t]) => t === 'e')?.[1]
    : null;

  return (
    <article
      className={cn(
        'px-4 py-4 border-b border-border hover:bg-accent/30 transition-colors cursor-pointer',
        reply && 'border-l-2 border-l-primary/30',
      )}
      onClick={onClick}
    >
      {repost && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 pl-10">
          <Repeat2 size={13} />
          <RepostLabel pubkey={event.pubkey} />
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar column */}
        <div className="flex-shrink-0 pt-0.5">
          <PostAuthor
            pubkey={event.pubkey}
            createdAt={event.created_at}
            compact
          />
        </div>
      </div>

      <div className="pl-0 mt-2">
        <PostAuthor pubkey={event.pubkey} createdAt={event.created_at} />

        <div className="mt-2">
          {longform ? (
            /* Long-form article in short feed: show cover + title + summary, NOT full content */
            <div className="rounded-xl border border-border overflow-hidden bg-card mt-2">
              {cover && (
                <img
                  src={cover}
                  alt={title ?? 'Article cover'}
                  className="w-full h-32 object-cover"
                  loading="lazy"
                />
              )}
              <div className="p-3">
                {title && (
                  <h3 className="font-semibold text-sm text-foreground mb-1 line-clamp-2">
                    {title}
                  </h3>
                )}
                {summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{summary}</p>
                )}
                <span className="text-xs text-primary mt-1 block">Read article →</span>
              </div>
            </div>
          ) : (
            <>
              {/* Normal note content */}
              <NoteContent content={event.content} maxLines={expanded ? undefined : 5} />

              {isLong && !expanded && (
                <button
                  className="text-xs text-primary mt-1 flex items-center gap-1 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(true);
                  }}
                >
                  <ChevronDown size={14} /> Show full post
                </button>
              )}
              {isLong && expanded && (
                <button
                  className="text-xs text-muted-foreground mt-1 flex items-center gap-1 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(false);
                  }}
                >
                  <ChevronUp size={14} /> Collapse
                </button>
              )}
            </>
          )}
        </div>

        {/* Media previews */}
        {images.length > 0 && !longform && (
          <div className={cn('mt-2 grid gap-1 rounded-xl overflow-hidden', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
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

        {videos.length > 0 && !longform && (
          <div className="mt-2 rounded-xl overflow-hidden">
            <video
              src={videos[0]}
              controls
              className="w-full max-h-80 object-contain bg-black"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Actions */}
        <div className="mt-3">
          <PostActions eventId={event.id} compact />
        </div>
      </div>
    </article>
  );
}

function RepostLabel({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.display_name ?? author.data?.metadata?.name ?? 'Someone';
  return <span>{name} reposted</span>;
}
