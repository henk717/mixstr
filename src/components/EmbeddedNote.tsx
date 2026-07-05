import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';
import { useAuthor } from '@/hooks/useAuthor';
import { useEventById } from '@/hooks/useEventById';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { relativeTime, tryExtractEmbeddedEvent } from '@/lib/postUtils';

interface EmbeddedNoteProps {
  eventId: string;
  relays?: string[];
  authorHint?: string;
  className?: string;
  /**
   * Current nesting depth — EmbeddedNote will not render deeper than MAX_DEPTH.
   * Consumers should pass depth + 1 when creating recursive embeds.
   * Default: 0
   */
  depth?: number;
}

const MAX_DEPTH = 3;

/**
 * Fetches and renders a quoted Nostr event inline as a card.
 * Limits recursion to MAX_DEPTH (3) layers deep to avoid infinite loops.
 */
export function EmbeddedNote({ eventId, relays, authorHint, className, depth = 0 }: EmbeddedNoteProps) {
  const { nostr } = useNostr();

  const neventId = nip19.neventEncode({
    id: eventId,
    ...(authorHint ? { author: authorHint } : {}),
    ...(relays?.length ? { relays } : {}),
  });

  const { data: event, isLoading } = useEventById({
    eventId,
    pubkey: authorHint,
    relayHints: relays,
    timeoutMs: 6000,
    enabled: depth < MAX_DEPTH,
    staleTime: 5 * 60 * 1000,
  });

  // If we've hit max depth, just render a link
  if (depth >= MAX_DEPTH) {
    return (
      <Link
        to={`/${neventId}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'block border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors text-sm text-primary',
          className,
        )}
      >
        ↩ Quoted note
      </Link>
    );
  }

  return (
    <Link
      to={`/${neventId}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block border rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors my-2',
        className,
      )}
    >
      {isLoading && (
        <div className="animate-pulse space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-muted" />
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
          <div className="h-3 w-full bg-muted rounded" />
          <div className="h-3 w-3/4 bg-muted rounded" />
        </div>
      )}

      {!isLoading && !event && (
        <div className="text-xs text-muted-foreground font-mono truncate">
          Note not found · {neventId.slice(0, 20)}…
        </div>
      )}

      {event && <EmbeddedNoteBody event={event} depth={depth} />}
    </Link>
  );
}

function EmbeddedNoteBody({ event, depth }: { event: NostrEvent; depth: number }) {
  // A quoted note can itself be a repost/community-approval wrapper.
  const displayEvent = tryExtractEmbeddedEvent(event) ?? event;
  const author = useAuthor(displayEvent.pubkey);
  const meta = author.data?.metadata;
  const displayName = meta?.display_name || meta?.name || displayEvent.pubkey.slice(0, 10) + '…';

  // Lazy import NoteContent to avoid circular dependency — only used at depth < MAX_DEPTH
  // We render it with disableNoteEmbeds and disableMediaEmbeds to keep embedded cards compact
  // and prevent unbounded recursion.
  return (
    <div className="text-sm space-y-1">
      <div className="flex items-center gap-2">
        <Avatar className="w-5 h-5 flex-shrink-0">
          <AvatarImage src={meta?.picture} />
          <AvatarFallback className="text-[9px] bg-primary/20 text-primary font-bold">
            {displayName[0]?.toUpperCase() ?? '?'}
          </AvatarFallback>
        </Avatar>
        <span className="font-semibold text-foreground text-xs truncate">{displayName}</span>
        <span className="text-xs text-muted-foreground ml-auto shrink-0">{relativeTime(displayEvent.created_at)}</span>
      </div>
      <EmbeddedNoteContent event={displayEvent} depth={depth} />
    </div>
  );
}

/**
 * Renders note content inside an embedded card.
 * Uses the rich NoteContent but with disableNoteEmbeds + disableMediaEmbeds
 * to keep cards compact and prevent infinite nesting.
 */
function EmbeddedNoteContent({ event, depth }: { event: NostrEvent; depth: number }) {
  // Import inline to avoid circular dependency at module evaluation time.
  // NoteContent → EmbeddedNote → NoteContent is fine at runtime (React handles it),
  // but TypeScript/esbuild need a non-circular module graph at import time.
  // We break the cycle by deferring to a dynamic require inside the component body.
  const { NoteContent } = require('@/components/NoteContent') as { NoteContent: React.ComponentType<{
    event: NostrEvent;
    className?: string;
    disableNoteEmbeds?: boolean;
    disableMediaEmbeds?: boolean;
    disableEmbeds?: boolean;
  }> };

  // Inside the embed card: disable nested note embeds (prevents recursion).
  // Still show media at depth 0 (first level). At deeper levels, suppress media too.
  return (
    <NoteContent
      event={event}
      className="text-foreground/80 text-xs leading-relaxed line-clamp-4"
      disableNoteEmbeds={true}
      disableMediaEmbeds={depth >= 1}
    />
  );
}
