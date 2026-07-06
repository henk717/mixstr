import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronDown, ChevronUp, Play, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostAuthor } from './PostAuthor';
import { PostActions } from './PostActions';
import { RssAuthorHeader } from './RssAuthorHeader';
import { RssOpenRow } from './RssOpenRow';
import { RepostBanner } from './RepostBanner';
import { NoteContent } from '@/components/NoteContent';
import { FeedImageGallery } from './FeedImageGallery';
import { Button } from '@/components/ui/button';
import { ReplyingToChip } from './ReplyContext';
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
  getParentEventId,
  findRelayHintForEvent,
} from '@/lib/postUtils';
import { isRssSyntheticEvent } from '@/lib/rssAdapter';
import { useParentEvent } from '@/hooks/useParentEvent';
import { useResolvedEvent } from '@/hooks/useResolvedEvent';
import { useIsVisible } from '@/hooks/useIsVisible';

interface ShortPostCardProps {
  event: NostrEvent;
  /** Optional community moderation action. */
  moderation?: { onApprove: () => void };
}

export function ShortPostCard({ event, moderation }: ShortPostCardProps) {
  const [textExpanded, setTextExpanded] = useState(false);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const navigate = useNavigate();
  const { ref: actionsRef, isVisible: actionsVisible } = useIsVisible<HTMLDivElement>();

  // Resolve repost/community-approval wrappers to the original event.
  const { event: displayEvent, wrapper } = useResolvedEvent(event);

  const isLong = displayEvent.content.length > 280;
  const images = extractImages(displayEvent);
  const videos = extractVideos(displayEvent);
  const embeds = extractExternalEmbeds(displayEvent);
  const reply = isReply(displayEvent);
  const longform = isLongform(displayEvent);
  const title = getEventTitle(displayEvent);
  const cover = getCoverImage(displayEvent);
  const summary = getSummary(displayEvent);
  const relayHint = wrapper ? findRelayHintForEvent(event, displayEvent.id) : undefined;
  const nevent = eventToNevent(displayEvent, relayHint ? [relayHint] : undefined);
  const isRss = isRssSyntheticEvent(displayEvent);

  // For replies: fetch the parent event so the compact chip can replace the
  // placeholder text once it resolves.
  const parentRef = reply ? getParentEventId(displayEvent) : null;
  const { data: parentEvent, isPending: parentPending } = useParentEvent(parentRef);

  const hasMedia = images.length > 0 || videos.length > 0 || embeds.length > 0;

  const handleCardClick = () => {
    if (isRss) {
      const link = displayEvent.tags.find(([k]) => k === 'link')?.[1];
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(`/${nevent}`);
  };

  // Build a compact media hint label e.g. "2 images · 1 video"
  const mediaParts: string[] = [];
  if (images.length > 0) mediaParts.push(`${images.length} image${images.length > 1 ? 's' : ''}`);
  if (videos.length > 0) mediaParts.push(`${videos.length} video${videos.length > 1 ? 's' : ''}`);
  if (embeds.length > 0 && videos.length === 0 && images.length === 0)
    mediaParts.push(embeds[0].label);
  const mediaHint = mediaParts.join(' · ');

  return (
    <article className="border-b border-border">
      {/* ── Repost / community approval banner ── */}
      {wrapper && (
        <RepostBanner wrapper={wrapper} className="pt-2.5 px-4 pb-0.5 pl-[54px]" />
      )}

      {/* ── Compact "Replying to" chip (short view keeps it minimal) ── */}
      {reply && parentRef && (
        <ReplyingToChip
          parentId={parentRef.id}
          parent={parentEvent}
          isPending={parentPending}
        />
      )}

      {/* ── Main post ── */}
      <div
        className="px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={handleCardClick}
      >
        {isRss ? (
          <RssAuthorHeader event={displayEvent} compact />
        ) : (
          <PostAuthor
            pubkey={displayEvent.pubkey}
            createdAt={displayEvent.created_at}
            compact
          />
        )}

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
              {/*
                Short view: text only — media is intentionally suppressed here and
                shown as a collapsed strip below. disableMediaEmbeds prevents images/
                videos from rendering inline so the strip stays the gatekeeper.
                Note embeds are enabled (disableNoteEmbeds stays false) so quoted notes
                resolve and render as cards; depth=1 ensures any media inside those
                embedded quote cards is suppressed, keeping the short-view layout intact.
              */}
              <NoteContent
                event={displayEvent}
                className={cn(
                  'text-sm leading-relaxed text-foreground/90',
                  !textExpanded && 'line-clamp-4',
                )}
                disableMediaEmbeds
                depth={1}
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

          {/* ── Collapsible media strip (short view) ── */}
          {hasMedia && !longform && (
            <div className="mt-2">
              {mediaExpanded ? (
                <>
                  {images.length > 0 && <FeedImageGallery images={images} />}

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

                  <button
                    className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => { e.stopPropagation(); setMediaExpanded(false); }}
                  >
                    <ChevronUp size={13} />
                    Collapse media
                  </button>
                </>
              ) : (
                /* Collapsed media strip — small thumbnails */
                <button
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors group"
                  onClick={(e) => { e.stopPropagation(); setMediaExpanded(true); }}
                >
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
                  <span className="group-hover:underline">{mediaHint}</span>
                  <ChevronDown size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          ref={actionsRef}
          className="mt-2 pl-11"
          onClick={(e) => e.stopPropagation()}
        >
          {isRss ? (
            <RssOpenRow event={displayEvent} compact />
          ) : actionsVisible ? (
            <PostActions event={displayEvent} compact enabled={actionsVisible} />
          ) : (
            <div className="h-5" aria-hidden="true" />
          )}
        </div>

        {/* Moderation */}
        {moderation && (
          <div className="mt-2 pl-11" onClick={(e) => e.stopPropagation()}>
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


