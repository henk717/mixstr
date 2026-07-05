import { Link } from 'react-router-dom';
import { CornerDownRight } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';
import { useAuthor } from '@/hooks/useAuthor';
import { relativeTime, stripMediaUrls, tryExtractEmbeddedEvent } from '@/lib/postUtils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * Shows the parent event above a reply in Twitter-style thread view.
 * The parent is shown in a compact format with a vertical thread line connecting down.
 */
export function ReplyParentPreview({
  parent,
  onParentClick,
  className,
}: {
  parent: NostrEvent;
  onParentClick: () => void;
  className?: string;
}) {
  // Reposts/community approvals can appear as parents in some thread layouts.
  const displayParent = tryExtractEmbeddedEvent(parent) ?? parent;
  const author = useAuthor(displayParent.pubkey);
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || displayParent.pubkey.slice(0, 10) + '…';
  const npub = nip19.npubEncode(displayParent.pubkey);

  // Strip media URLs from the preview text for compactness
  const previewText = displayParent.content
    .replace(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|avif|mp4|webm|mov|mp3|ogg|wav)(?:[?#]\S*)?/gi, '')
    .replace(/\n{2,}/g, ' ')
    .trim()
    .slice(0, 120);

  return (
    <div
      className={cn(
        'px-4 pt-3 pb-0 cursor-pointer hover:bg-accent/20 transition-colors',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        onParentClick();
      }}
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
              {relativeTime(displayParent.created_at)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">
            {previewText || <span className="italic">Media or attachment</span>}
            {displayParent.content.length > 120 && '…'}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact "Replying to @name" chip.
 *
 * Renders immediately with a placeholder. Once the resolved parent event is
 * supplied, the text is replaced with the actual author name (and links to the
 * parent event with an author hint so it resolves faster).
 */
export function ReplyingToChip({
  parentId,
  parent,
  isPending,
}: {
  parentId: string;
  parent?: NostrEvent | null;
  isPending?: boolean;
}) {
  // Prefer the resolved parent's author; fall back to the tag hint if available.
  const author = useAuthor(parent?.pubkey ?? '');
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim();

  const neventLink = (() => {
    try {
      return nip19.neventEncode({ id: parentId, ...(parent?.pubkey ? { author: parent.pubkey } : {}) });
    } catch {
      return parentId;
    }
  })();

  const text = (() => {
    if (displayName) return `@${displayName}`;
    if (isPending || author.isPending) return '…';
    return 'a post';
  })();

  // Compact snippet of the parent post, stripped of media/URLs/embeds.
  const snippetParent = parent ? (tryExtractEmbeddedEvent(parent) ?? parent) : null;
  const snippet = snippetParent
    ? stripMediaUrls(snippetParent.content)
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

  return (
    <div className="flex items-center gap-1 px-4 pt-2 pb-0 pl-[54px]">
      <CornerDownRight size={11} className="text-muted-foreground/60 flex-shrink-0" />
      <span className="text-xs text-muted-foreground">replying to </span>
      <Link
        to={`/${neventLink}`}
        onClick={(e) => e.stopPropagation()}
        className="text-xs text-primary hover:underline truncate max-w-[260px]"
      >
        {text}
        {parent && snippet && (
          <span className="text-muted-foreground"> · {snippet}</span>
        )}
      </Link>
    </div>
  );
}
