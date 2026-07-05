import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { ChevronDown, ChevronUp, Repeat2, Play, ExternalLink, CornerDownRight } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';
import { PostAuthor } from './PostAuthor';
import { PostActions } from './PostActions';
import { NoteContent } from '@/components/NoteContent';
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
  getParentEventId,
  relativeTime,
} from '@/lib/postUtils';
import { useAuthor } from '@/hooks/useAuthor';
import { useParentEvent } from '@/hooks/useParentEvent';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ShortPostCardProps {
  event: NostrEvent;
}

export function ShortPostCard({ event }: ShortPostCardProps) {
  const [textExpanded, setTextExpanded] = useState(false);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const navigate = useNavigate();

  // For kind 6 reposts, the actual content to render is the embedded event JSON
  const repost = isRepost(event);
  const embeddedEvent: NostrEvent | null = (() => {
    if (!repost || !event.content) return null;
    try {
      const parsed = JSON.parse(event.content) as NostrEvent;
      if (parsed && typeof parsed.id === 'string' && typeof parsed.kind === 'number') return parsed;
    } catch { /* not JSON */ }
    return null;
  })();

  // Use the embedded event for display when available, otherwise use the outer event
  const displayEvent = embeddedEvent ?? event;

  const isLong = displayEvent.content.length > 280;
  const images = extractImages(displayEvent);
  const videos = extractVideos(displayEvent);
  const embeds = extractExternalEmbeds(displayEvent);
  const reply = isReply(event);
  const longform = isLongform(displayEvent);
  const title = getEventTitle(displayEvent);
  const cover = getCoverImage(displayEvent);
  const summary = getSummary(displayEvent);
  const nevent = eventToNevent(displayEvent);

  // For replies: get parent event ID and fetch parent event
  const parentRef = reply ? getParentEventId(event) : null;
  const { data: parentEvent, isPending: parentPending } = useParentEvent(parentRef);

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
    <article className="border-b border-border">
      {/* ── Repost banner ── */}
      {repost && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2.5 px-4 pb-0.5 pl-[54px]">
          <Repeat2 size={13} />
          <RepostLabel pubkey={event.pubkey} />
        </div>
      )}

      {/* ── Twitter-style parent context (for replies, when parent loaded) ── */}
      {reply && parentEvent && (
        <ParentEventPreview parent={parentEvent} onParentClick={() => navigate(`/${eventToNevent(parentEvent)}`)} />
      )}

      {/* ── Compact "Replying to" chip ──
           Show whenever we don't have the full parent event yet (still loading,
           errored, or not found). Once parentEvent is truthy the block above takes over. */}
      {reply && !parentEvent && parentRef && (
        <ReplyingToChip event={event} parentId={parentRef.id} parentAuthor={parentRef.author} isPending={parentPending} />
      )}

      {/* ── Main post ── */}
      <div
        className={cn(
          'px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer',
          reply && parentEvent && 'pt-2',
        )}
        onClick={handleCardClick}
      >
        <PostAuthor
          pubkey={repost && embeddedEvent ? embeddedEvent.pubkey : event.pubkey}
          createdAt={repost && embeddedEvent ? embeddedEvent.created_at : event.created_at}
        />

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
                disableNoteEmbeds keeps quoted notes from adding bulk in the feed.
              */}
              <NoteContent
                event={displayEvent}
                className={cn(
                  'text-sm leading-relaxed text-foreground/90',
                  !textExpanded && 'line-clamp-4',
                )}
                disableMediaEmbeds
                disableNoteEmbeds={!textExpanded}
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
        <div className="mt-2 pl-11" onClick={(e) => e.stopPropagation()}>
          <PostActions event={displayEvent} compact />
        </div>
      </div>
    </article>
  );
}

/**
 * Shows the parent event above a reply in Twitter-style thread view.
 * The parent is shown in a compact format with a vertical thread line connecting down.
 */
function ParentEventPreview({ parent, onParentClick }: { parent: NostrEvent; onParentClick: () => void }) {
  const author = useAuthor(parent.pubkey);
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || parent.pubkey.slice(0, 10) + '…';
  const npub = nip19.npubEncode(parent.pubkey);

  // Strip media URLs from the preview text for compactness
  const previewText = parent.content
    .replace(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|avif|mp4|webm|mov|mp3|ogg|wav)(?:[?#]\S*)?/gi, '')
    .replace(/\n{2,}/g, ' ')
    .trim()
    .slice(0, 120);

  return (
    <div
      className="px-4 pt-3 pb-0 cursor-pointer hover:bg-accent/20 transition-colors"
      onClick={(e) => { e.stopPropagation(); onParentClick(); }}
    >
      {/* Parent author row */}
      <div className="flex gap-3">
        <div className="flex flex-col items-center flex-shrink-0">
          <Link to={`/${npub}`} onClick={(e) => e.stopPropagation()}>
            <Avatar className="w-9 h-9">
              <AvatarImage src={meta?.picture} />
              <AvatarFallback className="text-xs bg-muted-foreground/20 text-muted-foreground font-bold">
                {displayName[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
          </Link>
          {/* Thread connector line from parent down to reply avatar */}
          <div className="w-0.5 bg-border/60 flex-1 mt-1.5 min-h-[24px]" />
        </div>

        <div className="flex-1 min-w-0 pb-1">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <Link
              to={`/${npub}`}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-sm text-foreground hover:text-primary transition-colors truncate"
            >
              {displayName}
            </Link>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {relativeTime(parent.created_at)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">
            {previewText || <span className="italic">Media or attachment</span>}
            {parent.content.length > 120 && '…'}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact "Replying to @name" chip, shown while the parent event is still
 * loading or if it couldn't be fetched from any relay.
 */
function ReplyingToChip({ event: _event, parentId, parentAuthor, isPending }: {
  event: NostrEvent;
  parentId: string;
  parentAuthor?: string;
  isPending?: boolean;
}) {
  // Try to resolve the author's display name from the pubkey hint in the e-tag.
  // This often resolves even before the parent event is found, giving us a name.
  const author = useAuthor(parentAuthor ?? '');
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim();

  const neventLink = (() => {
    try {
      return nip19.neventEncode({ id: parentId, ...(parentAuthor ? { author: parentAuthor } : {}) });
    } catch {
      return parentId;
    }
  })();

  return (
    <div className="flex items-center gap-1 px-4 pt-2 pb-0 pl-[54px]">
      <CornerDownRight size={11} className="text-muted-foreground/60 flex-shrink-0" />
      <span className="text-xs text-muted-foreground">replying to </span>
      <Link
        to={`/${neventLink}`}
        onClick={(e) => e.stopPropagation()}
        className="text-xs text-primary hover:underline truncate max-w-[180px]"
      >
        {displayName
          ? `@${displayName}`
          : parentAuthor
            ? `@${parentAuthor.slice(0, 8)}…`
            : isPending
              ? '…'
              : 'a post'}
      </Link>
    </div>
  );
}

function RepostLabel({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const rawName = author.data?.metadata?.display_name || author.data?.metadata?.name || '';
  const name = rawName.trim() || 'Someone';
  return <span>{name} reposted</span>;
}
