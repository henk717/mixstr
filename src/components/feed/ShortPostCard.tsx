import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronDown, ChevronUp, Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostAuthor } from './PostAuthor';
import { PostActions } from './PostActions';
import { NoteContent } from '@/components/NoteContent';
import {
  getEventTitle,
  getCoverImage,
  getSummary,
  isReply,
  isRepost,
  isLongform,
  eventToNevent,
} from '@/lib/postUtils';
import { useAuthor } from '@/hooks/useAuthor';

interface ShortPostCardProps {
  event: NostrEvent;
}

export function ShortPostCard({ event }: ShortPostCardProps) {
  const [textExpanded, setTextExpanded] = useState(false);
  const navigate = useNavigate();

  const isLong = event.content.length > 280;
  const reply = isReply(event);
  const repost = isRepost(event);
  const longform = isLongform(event);
  const title = getEventTitle(event);
  const cover = getCoverImage(event);
  const summary = getSummary(event);
  const nevent = eventToNevent(event);

  const handleCardClick = () => navigate(`/${nevent}`);

  return (
    <article
      className={cn(
        'px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors cursor-pointer',
        reply && 'border-l-2 border-l-primary/30 pl-3',
      )}
      onClick={handleCardClick}
    >
      {repost && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 pl-10">
          <Repeat2 size={13} />
          <RepostLabel pubkey={event.pubkey} />
        </div>
      )}

      <PostAuthor pubkey={event.pubkey} createdAt={event.created_at} />

      <div className="mt-1.5 pl-11">
        {longform ? (
          /* Long-form article card — compact horizontal layout */
          <div
            className="rounded-xl border border-border overflow-hidden bg-card flex gap-3 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            {cover && (
              <img
                src={cover}
                alt={title ?? 'Article'}
                className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                loading="lazy"
              />
            )}
            <div className="min-w-0 flex-1">
              {title && (
                <h3 className="font-semibold text-sm text-foreground leading-snug line-clamp-2">
                  {title}
                </h3>
              )}
              {summary && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{summary}</p>
              )}
              <span
                className="text-xs text-primary mt-1 block hover:underline"
                onClick={handleCardClick}
              >
                Read article →
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Rich note content — handles inline embeds, mentions, hashtags */}
            {textExpanded ? (
              <NoteContent
                event={event}
                className="text-sm leading-relaxed text-foreground/90"
              />
            ) : (
              <div className="relative">
                <NoteContent
                  event={event}
                  className={cn(
                    'text-sm leading-relaxed text-foreground/90',
                    isLong && !textExpanded && 'line-clamp-4',
                  )}
                  disableNoteEmbeds={false}
                  disableMediaEmbeds={false}
                />
              </div>
            )}

            {isLong && !textExpanded && (
              <button
                className="text-xs text-primary mt-1 flex items-center gap-1 hover:underline"
                onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }}
              >
                <ChevronDown size={13} />
                Show more
              </button>
            )}
            {isLong && textExpanded && (
              <button
                className="text-xs text-muted-foreground mt-1 flex items-center gap-1 hover:underline"
                onClick={(e) => { e.stopPropagation(); setTextExpanded(false); }}
              >
                <ChevronUp size={13} />
                Collapse
              </button>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="mt-2 pl-11" onClick={(e) => e.stopPropagation()}>
        <PostActions event={event} compact />
      </div>
    </article>
  );
}

function RepostLabel({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const rawName = author.data?.metadata?.display_name || author.data?.metadata?.name || '';
  const name = rawName.trim() || 'Someone';
  return <span>{name} reposted</span>;
}
