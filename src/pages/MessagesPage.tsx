import { useState, useMemo, useRef, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import {
  useDirectMessages,
  useDmDeletions,
  useDeleteConversation,
  groupIntoConversations,
  useSendDm,
} from '@/hooks/useDirectMessages';
import { useMuteList } from '@/hooks/useMuteList';
import { LoginArea } from '@/components/auth/LoginArea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Mail, Lock, ArrowLeft, Send, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { relativeTime } from '@/lib/postUtils';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import type { Conversation, DecryptedMessage } from '@/hooks/useDirectMessages';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

// ─── Avatar / name helpers ────────────────────────────────────────────────────

function ConversationAvatar({ pubkey, size = 'md' }: { pubkey: string; size?: 'sm' | 'md' }) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  const displayName = meta?.display_name || meta?.name || pubkey.slice(0, 8) + '…';
  const cls = size === 'sm' ? 'w-8 h-8' : 'w-11 h-11';
  return (
    <Avatar className={cls}>
      <AvatarImage src={meta?.picture} />
      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
        {displayName[0].toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function ConversationName({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  return <>{meta?.display_name || meta?.name || pubkey.slice(0, 10) + '…'}</>;
}

// ─── Conversation list item ───────────────────────────────────────────────────

function ConversationListItem({
  conv,
  active,
  onSelect,
  onDelete,
  isDeleting,
}: {
  conv: Conversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const last = conv.lastMessage;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-border transition-colors',
        active ? 'bg-primary/10' : 'hover:bg-accent/30',
      )}
      onClick={onSelect}
    >
      <ConversationAvatar pubkey={conv.peerPubkey} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold truncate">
            <ConversationName pubkey={conv.peerPubkey} />
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {relativeTime(last.rumor.created_at)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {last.isSent && <span className="text-primary/70">You: </span>}
          {last.rumor.content}
        </p>
      </div>

      <button
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all flex-shrink-0"
        onClick={(e) => { e.stopPropagation(); setShowDelete(true); }}
        disabled={isDeleting}
        title="Delete conversation"
      >
        {isDeleting
          ? <RefreshCw size={14} className="animate-spin" />
          : <Trash2 size={14} />}
      </button>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Messages up to this point will be hidden on all your devices. If this person messages
              you again, the new messages will still appear. This is synced to Nostr so it works
              across devices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowDelete(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, myPubkey }: { msg: DecryptedMessage; myPubkey: string }) {
  const isMine = msg.rumor.pubkey === myPubkey;
  return (
    <div className={cn('flex gap-2 mb-3', isMine ? 'flex-row-reverse' : 'flex-row')}>
      {!isMine && (
        <div className="flex-shrink-0 mt-auto">
          <ConversationAvatar pubkey={msg.rumor.pubkey} size="sm" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[72%] rounded-2xl px-4 py-2.5 text-sm',
          isMine
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{msg.rumor.content}</p>
        <p
          className={cn(
            'text-[10px] mt-1 text-right',
            isMine ? 'text-primary-foreground/60' : 'text-muted-foreground',
          )}
        >
          {relativeTime(msg.rumor.created_at)}
        </p>
      </div>
    </div>
  );
}

// ─── Chat view ────────────────────────────────────────────────────────────────

function ChatView({
  conv,
  myPubkey,
  onBack,
}: {
  conv: Conversation;
  myPubkey: string;
  onBack: () => void;
}) {
  const { send } = useSendDm();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const author = useAuthor(conv.peerPubkey);
  const meta = author.data?.metadata;
  const displayName = meta?.display_name || meta?.name || conv.peerPubkey.slice(0, 10) + '…';
  const npub = nip19.npubEncode(conv.peerPubkey);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages.length]);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await send(conv.peerPubkey, text.trim());
      setText('');
    } catch (err) {
      toast({ title: 'Failed to send', description: String(err), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/90 backdrop-blur flex-shrink-0">
        <button
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </button>
        <Link to={`/${npub}`} className="flex items-center gap-3 group">
          <ConversationAvatar pubkey={conv.peerPubkey} size="sm" />
          <div>
            <p className="text-sm font-semibold group-hover:text-primary transition-colors">
              {displayName}
            </p>
            {meta?.nip05 && (
              <p className="text-[10px] text-muted-foreground">{meta.nip05}</p>
            )}
          </div>
        </Link>
        <Lock size={12} className="text-green-500 ml-auto flex-shrink-0" title="End-to-end encrypted" />
      </div>

      {/* Messages — scrollable, fills remaining height */}
      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
        {conv.messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            No messages yet. Say hello!
          </div>
        )}
        {conv.messages.map((msg) => (
          <MessageBubble key={msg.wrapId} msg={msg} myPubkey={myPubkey} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose — always pinned at the bottom */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-border bg-background flex-shrink-0">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send)"
          className="resize-none min-h-[40px] max-h-32 text-sm"
          rows={1}
          disabled={sending}
        />
        <Button
          size="icon"
          className="flex-shrink-0 rounded-full w-10 h-10"
          onClick={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function MessagesPage() {
  useSeoMeta({ title: 'Messages · Mixstr' });

  const { user } = useCurrentUser();
  const { data: messages = [], isLoading: msgsLoading, error } = useDirectMessages();
  const { data: deletions = {}, isLoading: deletionsLoading } = useDmDeletions();
  const { muted } = useMuteList();
  const { mutate: deleteConv, isPending: isDeleting } = useDeleteConversation();
  const { toast } = useToast();

  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);

  const isLoading = msgsLoading || deletionsLoading;

  // Combine muted pubkeys from personal list and subscribed blocklists
  const mutedPubkeys = muted.pubkeys;

  const conversations = useMemo(
    () => groupIntoConversations(messages, deletions, mutedPubkeys),
    [messages, deletions, mutedPubkeys],
  );

  const selectedConv = useMemo(
    () => (selectedPeer ? conversations.find((c) => c.peerPubkey === selectedPeer) ?? null : null),
    [conversations, selectedPeer],
  );

  function handleDelete(peerPubkey: string) {
    // Record the current time as the deletion cutoff
    const deletedAt = Math.floor(Date.now() / 1000);
    deleteConv(
      { peerPubkey, deletedAt },
      {
        onSuccess: () => {
          toast({
            title: 'Conversation deleted',
            description: 'Hidden on all your devices. New messages will still appear.',
          });
          if (selectedPeer === peerPubkey) setSelectedPeer(null);
        },
        onError: (err) => {
          toast({
            title: 'Failed to delete',
            description: String(err),
            variant: 'destructive',
          });
        },
      },
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <Mail size={40} className="text-muted-foreground" />
        <p className="text-muted-foreground">Log in to read your encrypted messages.</p>
        <LoginArea className="max-w-64" />
      </div>
    );
  }

  if (!user.signer.nip44) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <AlertCircle size={40} className="text-yellow-500" />
        <p className="font-semibold">Signer upgrade required</p>
        <p className="text-muted-foreground text-sm max-w-sm">
          Your current signer doesn't support NIP-44 encryption. Please upgrade to a compatible
          browser extension or login method to use encrypted messages.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-full">

      {/* ── Conversation list view ── */}
      {!selectedConv && (
        <>
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border flex-shrink-0">
            <div className="px-4 py-4 flex items-center gap-2">
              <Mail size={20} className="text-primary" />
              <h1 className="text-lg font-bold">Messages</h1>
              <Lock size={14} className="text-green-500 ml-1" title="End-to-end encrypted" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Encryption info banner */}
            <div className="mx-4 my-3 px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 flex items-start gap-2">
              <Lock size={14} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">End-to-end encrypted via NIP-17.</span>{' '}
                Only you can read these messages. Deleted conversations are synced across all your devices.
              </p>
            </div>

            {isLoading && (
              <div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <Skeleton className="w-11 h-11 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && error && (
              <Card className="border-destructive/30 mx-4 my-4">
                <CardContent className="py-4 px-4 flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle size={16} />
                  Failed to load messages. Please try again.
                </CardContent>
              </Card>
            )}

            {!isLoading && !error && conversations.length === 0 && (
              <Card className="border-dashed mx-4 my-8">
                <CardContent className="py-12 px-8 text-center">
                  <Mail size={32} className="text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No messages yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    When someone sends you a NIP-17 encrypted message, it will appear here.
                  </p>
                </CardContent>
              </Card>
            )}

            {conversations.map((conv) => (
              <ConversationListItem
                key={conv.peerPubkey}
                conv={conv}
                active={selectedPeer === conv.peerPubkey}
                onSelect={() => setSelectedPeer(conv.peerPubkey)}
                onDelete={() => handleDelete(conv.peerPubkey)}
                isDeleting={isDeleting}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Chat view — fills the full height with sticky compose bar ── */}
      {selectedConv && (
        <ChatView
          conv={selectedConv}
          myPubkey={user.pubkey}
          onBack={() => setSelectedPeer(null)}
        />
      )}
    </div>
  );
}
