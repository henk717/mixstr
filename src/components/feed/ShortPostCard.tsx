import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronDown, ChevronUp, Repeat2, Image, Video, Play, ExternalLink } from 'lucide-react';
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
  const [textExpanded, setTextExpanded] = useState(false);
  const [mediaExpanded, setMediaExpanded] = useState(false);
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

  const hasMedia = images.length > 0 || videos.length > 0 || embeds.length > 0;

  const handleCardClick = () => navigate(`/${nevent}`);

  // Build a compact media hint label e.g. "2 images · 1 video"
  const mediaParts: string[] = [];
  if (images.length > 0) mediaParts.push(`${images.length} image${images.length > 1 ? 's' : ''}`);
  if (videos.length > 0) mediaParts.push(`${videos.length} video${videos.length > 1 ? 's' : ''}`);
  if (embeds.length > 0 && videos.length === 0 && images.length === 0)
    mediaParts.push(embeds[0].label);
  const mediaHint = mediaParts.join(' · ');

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
            {/* Text content — capped at 4 lines by default */}
            <NoteContent
              content={event.content}
              maxLines={textExpanded ? undefined : 4}
            />

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

        {/* ── Media section ── */}
        {hasMedia && !longform && (
          <div className="mt-2">
            {mediaExpanded ? (
              <>
                {/* Full media */}
                {images.length > 0 && (
                  <div
                    className={cn(
                      'grid gap-1 rounded-xl overflow-hidden',
                      images.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {images.slice(0, 4).map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="w-full object-cover aspect-video"
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}

                {videos.length > 0 && (
                  <div className="mt-1 rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <video
                      src={videos[0]}
                      controls
                      className="w-full max-h-72 object-contain bg-black"
                    />
                  </div>
                )}

                {embeds.length > 0 && videos.length === 0 && images.length === 0 && (
                  <div
                    className="mt-1 rounded-xl overflow-hidden border border-border aspect-video"
                    onClick={(e) => e.stopPropagation()}
                  >
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

                {/* Collapse button */}
                <button
                  className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={(e) => { e.stopPropagation(); setMediaExpanded(false); }}
                >
                  <ChevronUp size={13} />
                  Collapse media
                </button>
              </>
            ) : (
              /* Collapsed media strip */
              <button
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors group"
                onClick={(e) => { e.stopPropagation(); setMediaExpanded(true); }}
              >
                {/* Tiny thumbnail strip */}
                <div className="flex -space-x-1">
                  {images.slice(0, 3).map((url, i) => (
                    <div
                      key={i}
                      className="w-7 h-7 rounded-md overflow-hidden border-2 border-background bg-muted flex-shrink-0"
                      style={{ zIndex: 3 - i }}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ))}
                  {videos.length > 0 && images.length === 0 && (
                    <div className="w-7 h-7 rounded-md bg-muted border-2 border-background flex items-center justify-center flex-shrink-0">
                      <Play size={10} className="text-muted-foreground" />
                    </div>
                  )}
                  {embeds.length > 0 && images.length === 0 && videos.length === 0 && (
                    <div className="w-7 h-7 rounded-md bg-muted border-2 border-background flex items-center justify-center flex-shrink-0">
                      <ExternalLink size={10} className="text-muted-foreground" />
                    </div>
                  )}
                </div>

                <span className="group-hover:underline">
                  {mediaHint}
                </span>
                <ChevronDown size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-2 pl-11">
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
