import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronDown, ChevronUp, Repeat2 } from 'lucide-react';
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
  isRepost,
  isLongform,
  eventToNevent,
} from '@/lib/postUtils';
import { useAuthor } from '@/hooks/useAuthor';

interface ShortPostCardProps {
  event: NostrEvent;
}

export function ShortPostCard({ event }: ShortPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const isLong = event.content.length > 280;
  const images = extractImages(event);
  const videos = extractVideos(event);
  const embeds = extractExternalEmbeds(event);
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
        'px-4 py-4 border-b border-border hover:bg-accent/30 transition-colors cursor-pointer',
        reply && 'border-l-2 border-l-primary/30',
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

      <div className="mt-2">
        {longform ? (
          <div className="rounded-xl border border-border overflow-hidden bg-card mt-2">
            {cover && (
              <img src={cover} alt={title ?? 'Article cover'} className="w-full h-32 object-cover" loading="lazy" />
            )}
            <div className="p-3">
              {title && <h3 className="font-semibold text-sm text-foreground mb-1 line-clamp-2">{title}</h3>}
              {summary && <p className="text-xs text-muted-foreground line-clamp-2">{summary}</p>}
              <span className="text-xs text-primary mt-1 block">Read article →</span>
            </div>
          </div>
        ) : (
          <>
            <NoteContent content={event.content} maxLines={expanded ? undefined : 5} />

            {isLong && !expanded && (
              <button
                className="text-xs text-primary mt-1 flex items-center gap-1 hover:underline"
                onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              >
                <ChevronDown size={14} /> Show full post
              </button>
            )}
            {isLong && expanded && (
              <button
                className="text-xs text-muted-foreground mt-1 flex items-center gap-1 hover:underline"
                onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
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
            <img key={i} src={url} alt="" className="w-full object-cover aspect-video" loading="lazy"
              onClick={(e) => e.stopPropagation()} />
          ))}
        </div>
      )}

      {videos.length > 0 && !longform && (
        <div className="mt-2 rounded-xl overflow-hidden">
          <video src={videos[0]} controls className="w-full max-h-80 object-contain bg-black"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* External embeds (first one only for short view) */}
      {embeds.length > 0 && !longform && videos.length === 0 && images.length === 0 && (
        <div className="mt-2 rounded-xl overflow-hidden border border-border aspect-video"
          onClick={(e) => e.stopPropagation()}>
          <iframe
            src={embeds[0].embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            title={embeds[0].label}
          />
        </div>
      )}

      {/* Actions */}
      <div className="mt-3">
        <PostActions eventId={event.id} compact />
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
