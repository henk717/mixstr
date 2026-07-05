import { useState, useRef, useEffect } from 'react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Globe } from 'lucide-react';

interface ComposeDialogProps {
  open: boolean;
  onClose: () => void;
}

const MAX_LENGTH = 280;

export function ComposeDialog({ open, onClose }: ComposeDialogProps) {
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

  async function handlePost() {
    if (!canPost) return;
    try {
      await publish({ kind: 1, content: trimmed });
      toast({ title: 'Posted!', description: 'Your note was published to Nostr.' });
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to post',
        description: String(err),
        variant: 'destructive',
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handlePost();
    }
  }

  const displayName =
    metadata?.display_name?.trim() ||
    metadata?.name?.trim() ||
    'You';

  const charsLeft = MAX_LENGTH - charCount;
  const showCounter = charCount > MAX_LENGTH - 40;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="sr-only">New post</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 px-5 pt-4 pb-2">
          <Avatar className="w-10 h-10 flex-shrink-0 mt-0.5">
            <AvatarImage src={metadata?.picture} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
              {displayName[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground mb-1">{displayName}</p>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind?"
              className="resize-none border-0 bg-transparent p-0 text-base focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[120px] shadow-none"
              disabled={isPending}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border mt-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe size={13} />
            <span>Public · Nostr</span>
          </div>

          <div className="flex items-center gap-3">
            {showCounter && (
              <span
                className={`text-xs font-medium tabular-nums ${
                  overLimit ? 'text-destructive' : charsLeft <= 10 ? 'text-yellow-500' : 'text-muted-foreground'
                }`}
              >
                {charsLeft}
              </span>
            )}
            <Button
              size="sm"
              className="rounded-full px-5 font-semibold"
              disabled={!canPost}
              onClick={handlePost}
            >
              {isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  Posting…
                </>
              ) : (
                'Post'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
