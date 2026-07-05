import { useState } from 'react';
import { MessageCircle, Repeat2, Zap, Share2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useNostr } from '@nostrify/react';
import { useToast } from '@/hooks/useToast';
import { usePostReactions, formatZapAmount } from '@/hooks/usePostReactions';
import { ReplyDialog } from './ReplyDialog';
import type { NostrEvent } from '@nostrify/nostrify';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface PostActionsProps {
  /** The full event, needed to build proper reply/react tags */
  event: NostrEvent;
  compact?: boolean;
}

export function PostActions({ event, compact = false }: PostActionsProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [replyOpen, setReplyOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { replies, reposts, reactions, zapsMsats, isLoading } = usePostReactions(
    event.id,
    user?.pubkey,
  );

  const btnCls = cn(
    'flex items-center gap-1.5 text-muted-foreground transition-colors group select-none',
    compact ? 'text-xs' : 'text-sm',
  );
  const iconSize = compact ? 14 : 16;

  // ── Reply ────────────────────────────────────────────────────────────
  function handleReply(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) {
      toast({ title: 'Login required', description: 'Please log in to reply.', variant: 'destructive' });
      return;
    }
    setReplyOpen(true);
  }

  // ── Repost ───────────────────────────────────────────────────────────
  async function handleRepost(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) {
      toast({ title: 'Login required', description: 'Please log in to repost.', variant: 'destructive' });
      return;
    }
    try {
      // NIP-18: kind 6 repost — content = JSON-serialised original event
      await publish({
        kind: 6,
        content: JSON.stringify(event),
        tags: [
          ['e', event.id, '', 'mention'],
          ['p', event.pubkey],
          ['k', String(event.kind)],
        ],
      });
      // Also re-broadcast the original to spread it
      await rebroadcast(event);
      toast({ title: 'Reposted!', description: 'Note reposted and rebroadcast to all relays.' });
      queryClient.invalidateQueries({ queryKey: ['nostr', 'post-reactions', event.id] });
    } catch (err) {
      toast({ title: 'Repost failed', description: String(err), variant: 'destructive' });
    }
  }

  // ── Like / React ─────────────────────────────────────────────────────
  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) {
      toast({ title: 'Login required', description: 'Please log in to react.', variant: 'destructive' });
      return;
    }
    if (reactions.hasReacted) {
      toast({ title: 'Already reacted', description: 'You have already reacted to this post.' });
      return;
    }
    try {
      // NIP-25: kind 7 reaction; content "+" = thumbs up
      await publish({
        kind: 7,
        content: '+',
        tags: [
          ['e', event.id],
          ['p', event.pubkey],
          ['k', String(event.kind)],
        ],
      });
      // Re-broadcast the liked event to spread it
      await rebroadcast(event);
      toast({ title: 'Liked!', description: 'Reaction published and event rebroadcast.' });
      queryClient.invalidateQueries({ queryKey: ['nostr', 'post-reactions', event.id] });
    } catch (err) {
      toast({ title: 'Failed to react', description: String(err), variant: 'destructive' });
    }
  }

  // ── Zap ──────────────────────────────────────────────────────────────
  async function handleZap(e: React.MouseEvent) {
    e.stopPropagation();
    toast({
      title: 'Zap coming soon',
      description: 'Lightning zaps require NWC wallet integration — this is on the roadmap!',
    });
  }

  // ── Share / Copy link ─────────────────────────────────────────────────
  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { nip19 } = await import('nostr-tools');
      const neventId = nip19.neventEncode({ id: event.id, author: event.pubkey, kind: event.kind });
      const url = `${window.location.origin}/${neventId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Link copied!', description: 'Post link copied to clipboard.' });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  }

  /** Re-publish an existing signed event to all configured write relays */
  async function rebroadcast(ev: NostrEvent) {
    try {
      await nostr.event(ev, { signal: AbortSignal.timeout(5000) });
    } catch {
      // Rebroadcast failure is non-fatal
    }
  }

  const zapSats = Math.floor(zapsMsats / 1000);
  const zapLabel = formatZapAmount(zapsMsats);

  // Determine which emoji to show for the like button
  const likeEmoji = reactions.topEmoji === '👍' || reactions.count === 0 ? null : reactions.topEmoji;

  return (
    <>
      <div
        className={cn('flex items-center', compact ? 'gap-3' : 'gap-5')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Reply */}
        <button
          className={cn(btnCls, 'hover:text-blue-400')}
          onClick={handleReply}
          title="Reply"
          aria-label={`Reply · ${replies}`}
        >
          <span className="p-1.5 rounded-full group-hover:bg-blue-400/10 transition-colors">
            <MessageCircle size={iconSize} />
          </span>
          {!isLoading && replies > 0 && (
            <span className="tabular-nums">{replies >= 1000 ? `${Math.floor(replies / 1000)}k` : replies}</span>
          )}
        </button>

        {/* Repost */}
        <button
          className={cn(btnCls, 'hover:text-green-400')}
          onClick={handleRepost}
          title="Repost"
          aria-label={`Repost · ${reposts}`}
        >
          <span className="p-1.5 rounded-full group-hover:bg-green-400/10 transition-colors">
            <Repeat2 size={iconSize} />
          </span>
          {!isLoading && reposts > 0 && (
            <span className="tabular-nums">{reposts >= 1000 ? `${Math.floor(reposts / 1000)}k` : reposts}</span>
          )}
        </button>

        {/* React / Like */}
        <button
          className={cn(
            btnCls,
            reactions.hasReacted ? 'text-pink-400' : 'hover:text-pink-400',
          )}
          onClick={handleLike}
          title={reactions.hasReacted ? 'Reacted' : 'React'}
          aria-label={`React · ${reactions.count}`}
        >
          <span className={cn(
            'p-1.5 rounded-full transition-colors',
            reactions.hasReacted
              ? 'bg-pink-400/10'
              : 'group-hover:bg-pink-400/10',
          )}>
            {likeEmoji ? (
              <span className={compact ? 'text-sm' : 'text-base'} style={{ lineHeight: 1 }}>{likeEmoji}</span>
            ) : (
              <HeartIcon size={iconSize} filled={reactions.hasReacted} />
            )}
          </span>
          {!isLoading && reactions.count > 0 && (
            <span className="tabular-nums">
              {reactions.count >= 1000 ? `${Math.floor(reactions.count / 1000)}k` : reactions.count}
            </span>
          )}
        </button>

        {/* Zap */}
        <button
          className={cn(btnCls, zapSats > 0 ? 'text-yellow-400' : 'hover:text-yellow-400')}
          onClick={handleZap}
          title={zapSats > 0 ? `${zapSats} sats` : 'Zap'}
          aria-label={`Zap · ${zapLabel || 0}`}
        >
          <span className={cn(
            'p-1.5 rounded-full transition-colors',
            zapSats > 0 ? 'bg-yellow-400/10' : 'group-hover:bg-yellow-400/10',
          )}>
            <Zap size={iconSize} className={zapSats > 0 ? 'fill-yellow-400' : ''} />
          </span>
          {!isLoading && zapLabel && (
            <span className="tabular-nums">{zapLabel}</span>
          )}
        </button>

        {/* Share */}
        <button
          className={cn(btnCls, 'hover:text-primary ml-auto')}
          onClick={handleShare}
          title="Copy link"
          aria-label="Copy link"
        >
          <span className="p-1.5 rounded-full group-hover:bg-primary/10 transition-colors">
            {copied ? <Check size={iconSize} className="text-green-400" /> : <Share2 size={iconSize} />}
          </span>
        </button>
      </div>

      {/* Reply dialog */}
      {replyOpen && (
        <ReplyDialog
          open={replyOpen}
          onClose={() => {
            setReplyOpen(false);
            queryClient.invalidateQueries({ queryKey: ['nostr', 'post-reactions', event.id] });
          }}
          replyTo={event}
        />
      )}
    </>
  );
}

/** SVG heart icon that can be filled or outlined */
function HeartIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
