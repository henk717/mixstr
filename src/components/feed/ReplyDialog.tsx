import { useState, useRef, useEffect } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useAuthor } from '@/hooks/useAuthor';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, CornerDownRight } from 'lucide-react';
import { NoteContent } from '@/components/NoteContent';
import { relativeTime } from '@/lib/postUtils';

interface ReplyDialogProps {
  open: boolean;
  onClose: () => void;
  /** The event being replied to */
  replyTo: NostrEvent;
}

const MAX_LENGTH = 500;

export function ReplyDialog({ open, onClose, replyTo }: ReplyDialogProps) {
  const { user, metadata } = useCurrentUser();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = content.trim();
  const charCount = content.length;
  const overLimit = charCount > MAX_LENGTH;
  const canPost = trimmed.length > 0 && !overLimit && !isPending;

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    } else {
      setContent('');
    }
  }, [open]);

  async function handleReply() {
    if (!canPost) return;
    try {
      // Build reply tags following NIP-10 conventions:
      // - 'e' tag pointing to root + the event we're replying to
      // - 'p' tag mentioning the author of the original post
      const eTags: string[][] = [];

      // Find the root event (if replyTo is itself a reply)
      const rootTag = replyTo.tags.find(([t, , , marker]) => t === 'e' && marker === 'root');
      const rootId = rootTag?.[1];

      if (rootId && rootId !== replyTo.id) {
        eTags.push(['e', rootId, '', 'root']);
        eTags.push(['e', replyTo.id, '', 'reply']);
      } else {
        eTags.push(['e', replyTo.id, '', 'root']);
      }

      // Mention the original author
      const pTags: string[][] = [['p', replyTo.pubkey]];

      await publish({
        kind: 1,
        content: trimmed,
        tags: [...eTags, ...pTags],
      });

      toast({ title: 'Reply posted!', description: 'Your reply was published to Nostr.' });
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to post reply',
        description: String(err),
        variant: 'destructive',
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleReply();
    }
  }

  const displayName =
    metadata?.display_name?.trim() ||
    metadata?.name?.trim() ||
    'You';

  const charsLeft = MAX_LENGTH - charCount;
  const showCounter = charCount > MAX_LENGTH - 60;

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="sr-only">Reply to post</DialogTitle>
        </DialogHeader>

        {/* Original post preview */}
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <OriginalPost event={replyTo} />
        </div>

        {/* Reply input */}
        <div className="flex gap-3 px-5 pt-3 pb-2">
          <div className="flex flex-col items-center gap-1">
            <Avatar className="w-9 h-9 flex-shrink-0">
              <AvatarImage src={metadata?.picture} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                {displayName[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <CornerDownRight size={11} />
              <span>replying as <span className="text-foreground font-medium">{displayName}</span></span>
            </div>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write your reply…"
              className="resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[100px] shadow-none"
              disabled={isPending}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border mt-1">
          <div className="text-xs text-muted-foreground">Ctrl+Enter to post</div>

          <div className="flex items-center gap-3">
            {showCounter && (
              <span
                className={`text-xs font-medium tabular-nums ${
                  overLimit ? 'text-destructive' : charsLeft <= 20 ? 'text-yellow-500' : 'text-muted-foreground'
                }`}
              >
                {charsLeft}
              </span>
            )}
            <Button
              size="sm"
              className="rounded-full px-5 font-semibold"
              disabled={!canPost}
              onClick={handleReply}
            >
              {isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  Replying…
                </>
              ) : (
                'Reply'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OriginalPost({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const displayName = meta?.display_name || meta?.name || event.pubkey.slice(0, 10) + '…';

  return (
    <div className="flex gap-3">
      <Avatar className="w-9 h-9 flex-shrink-0">
        <AvatarImage src={meta?.picture} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
          {displayName[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{displayName}</span>
          <span className="text-xs text-muted-foreground">{relativeTime(event.created_at)}</span>
        </div>
        <NoteContent
          event={event}
          className="text-sm text-foreground/80 mt-0.5 line-clamp-3"
          disableEmbeds
          disableNoteEmbeds
          disableMediaEmbeds
        />
      </div>
    </div>
  );
}
