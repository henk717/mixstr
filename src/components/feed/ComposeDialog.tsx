import { useEffect, useRef, useState } from 'react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MentionTextarea } from './MentionTextarea';
import { LongFormEditor } from './LongFormEditor';
import { extractContentTags } from '@/lib/mentions';
import { buildLongFormTags } from '@/lib/longform';
import { Loader2, Globe, FileText, BookOpen } from 'lucide-react';

type TabValue = 'note' | 'longform';

interface ComposeDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ArticleInput {
  title: string;
  summary: string;
  content: string;
  image: string;
}

const emptyArticle: ArticleInput = {
  title: '',
  summary: '',
  content: '',
  image: '',
};

/** Hidden power-user helper: try to interpret pasted text as a raw Nostr event. */
function tryParseRawEvent(text: string): { kind: number; content: string; tags: string[][] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const kind = typeof parsed.kind === 'number' ? parsed.kind : Number(parsed.kind);
    if (!Number.isInteger(kind) || kind < 0 || kind > 65535) {
      return null;
    }

    const content = typeof parsed.content === 'string' ? parsed.content : '';

    const tags: string[][] = [];
    if (parsed.tags !== undefined) {
      if (!Array.isArray(parsed.tags)) return null;
      for (const tag of parsed.tags) {
        if (!Array.isArray(tag) || tag.some((v) => typeof v !== 'string')) {
          return null;
        }
        tags.push(tag as string[]);
      }
    }

    return { kind, content, tags };
  } catch {
    return null;
  }
}

export function ComposeDialog({ open, onClose }: ComposeDialogProps) {
  const { user, metadata } = useCurrentUser();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabValue>('note');
  const [noteContent, setNoteContent] = useState('');
  const [article, setArticle] = useState<ArticleInput>(emptyArticle);

  const noteRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setTab('note');
      setNoteContent('');
      setArticle(emptyArticle);
      setTimeout(() => noteRef.current?.focus(), 80);
    }
  }, [open]);

  // Focus the first field of the active tab when switching tabs.
  useEffect(() => {
    if (!open) return;
    if (tab === 'note') {
      setTimeout(() => noteRef.current?.focus(), 0);
    } else {
      setTimeout(() => titleRef.current?.focus(), 0);
    }
  }, [tab, open]);

  const displayName =
    metadata?.display_name?.trim() ||
    metadata?.name?.trim() ||
    'You';

  async function handlePostNote() {
    const trimmed = noteContent.trim();
    if (!trimmed || isPending) return;

    // Hidden power-user feature: if the pasted text is valid Nostr event JSON,
    // publish it as-is (re-signing and refreshing the timestamp).
    const rawEvent = tryParseRawEvent(trimmed);
    if (rawEvent) {
      try {
        await publish({
          kind: rawEvent.kind,
          content: rawEvent.content,
          tags: rawEvent.tags,
          created_at: Math.floor(Date.now() / 1000),
        });
        toast({ title: 'Raw event published!', description: `Published kind ${rawEvent.kind} to Nostr.` });
        onClose();
      } catch (err) {
        toast({
          title: 'Failed to publish raw event',
          description: String(err),
          variant: 'destructive',
        });
      }
      return;
    }

    try {
      await publish({
        kind: 1,
        content: trimmed,
        tags: extractContentTags(trimmed),
      });
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

  async function handlePostArticle() {
    const title = article.title.trim();
    const content = article.content.trim();
    if (!title || !content || isPending) return;
    try {
      await publish({
        kind: 30023,
        content,
        tags: buildLongFormTags({
          title,
          summary: article.summary.trim(),
          content,
          image: article.image.trim(),
        }),
      });
      toast({ title: 'Article published!', description: 'Your long-form post is live on Nostr.' });
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to publish article',
        description: String(err),
        variant: 'destructive',
      });
    }
  }

  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handlePostNote();
    }
  }

  const noteCanPost = noteContent.trim().length > 0 && !isPending;
  const articleCanPost =
    article.title.trim().length > 0 && article.content.trim().length > 0 && !isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[90dvh] overflow-hidden overflow-y-auto">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="sr-only">New post</DialogTitle>
          <DialogDescription className="sr-only">
            Create a new Nostr note or long-form article.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="px-5 pt-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="note" className="gap-1.5">
              <FileText size={14} />
              <span>Note</span>
            </TabsTrigger>
            <TabsTrigger value="longform" className="gap-1.5">
              <BookOpen size={14} />
              <span>Long-form</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="note" className="mt-4">
            <div className="flex gap-3">
              <Avatar className="w-10 h-10 flex-shrink-0 mt-0.5">
                <AvatarImage src={metadata?.picture} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                  {displayName[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground mb-1">{displayName}</p>
                <MentionTextarea
                  ref={noteRef}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  onKeyDown={handleNoteKeyDown}
                  placeholder="What's on your mind?"
                  className="border-0 bg-transparent p-0 text-base focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[140px] shadow-none break-words"
                  style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
                  disabled={isPending}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="longform" forceMount className="mt-4 space-y-4 data-[state=inactive]:hidden">
            <div className="space-y-1.5">
              <Label htmlFor="article-title">Title</Label>
              <Input
                id="article-title"
                ref={titleRef}
                value={article.title}
                onChange={(e) => setArticle((a) => ({ ...a, title: e.target.value }))}
                placeholder="Article title"
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="article-summary">Summary (optional)</Label>
              <Input
                id="article-summary"
                value={article.summary}
                onChange={(e) => setArticle((a) => ({ ...a, summary: e.target.value }))}
                placeholder="A short summary or teaser"
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="article-image">Cover image URL (optional)</Label>
              <Input
                id="article-image"
                value={article.image}
                onChange={(e) => setArticle((a) => ({ ...a, image: e.target.value }))}
                placeholder="https://…"
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Content</Label>
              <LongFormEditor
                value={article.content}
                onChange={(content) => setArticle((a) => ({ ...a, content }))}
                placeholder="Write your article…"
                disabled={isPending}
                className="border rounded-md"
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border mt-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe size={13} />
            <span>Public · Nostr</span>
          </div>

          <Button
            size="sm"
            className="rounded-full px-5 font-semibold"
            disabled={
              isPending ||
              (tab === 'note' && !noteCanPost) ||
              (tab === 'longform' && !articleCanPost)
            }
            onClick={() => {
              if (tab === 'note') handlePostNote();
              else handlePostArticle();
            }}
          >
            {isPending ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1.5" />
                Posting…
              </>
            ) : tab === 'longform' ? (
              'Publish'
            ) : (
              'Post'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
