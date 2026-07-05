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
import { Input } from '@/components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mail, Lock, ArrowLeft, Send, Trash2, AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { relativeTime } from '@/lib/postUtils';
import { nip19 } from 'nostr-tools';
import { Link, useParams, useNavigate } from 'react-router-dom';
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
  selectedPeer,
  onSelect,
  onDelete,
  isDeleting,
}: {
  conv: Conversation;
  selectedPeer: string | null;
  onSelect: (npub: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const peerNpub = useMemo(() => nip19.npubEncode(conv.peerPubkey), [conv.peerPubkey]);
  const active = selectedPeer === conv.peerPubkey;
  const last = conv.lastMessage;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-border transition-colors',
        active ? 'bg-primary/10' : 'hover:bg-accent/30',
      )}
      onClick={() => onSelect(peerNpub)}
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
  peerPubkey,
  messages,
  myPubkey,
  onBack,
}: {
  peerPubkey: string;
  messages: DecryptedMessage[];
  myPubkey: string;
  onBack: () => void;
}) {
  const { send } = useSendDm();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const author = useAuthor(peerPubkey);
  const meta = author.data?.metadata;
  const displayName = meta?.display_name || meta?.name || peerPubkey.slice(0, 10) + '…';
  const npub = nip19.npubEncode(peerPubkey);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await send(peerPubkey, text.trim());
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
          <ConversationAvatar pubkey={peerPubkey} size="sm" />
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
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            No messages yet. Say hello!
          </div>
        )}
        {messages.map((msg) => (
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

// ─── New conversation dialog ──────────────────────────────────────────────────

function NewConversationDialog({
  open,
  onOpenChange,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (input: string) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue('');
      setError('');
    }
  }, [open]);

  function handleSubmit() {
    const input = value.trim();
    if (!input) return;

    try {
      const decoded = nip19.decode(input);
      if (decoded.type !== 'npub' && decoded.type !== 'nprofile') {
        setError('Only npub and nprofile identifiers are supported.');
        return;
      }
      onStart(input);
    } catch {
      setError('Invalid npub or nprofile identifier.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>
            Enter the recipient's npub or nprofile to start an encrypted conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Input
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            placeholder="npub1…"
            aria-invalid={!!error}
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!value.trim()}>
            Start conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function MessagesPage() {
  useSeoMeta({ title: 'Messages · Mixstr' });

  const { recipient } = useParams();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { data: messages = [], isLoading: msgsLoading, error } = useDirectMessages();
  const { data: deletions = {}, isLoading: deletionsLoading } = useDmDeletions();
  const { muted } = useMuteList();
  const { mutate: deleteConv, isPending: isDeleting } = useDeleteConversation();
  const { toast } = useToast();

  const [newDmOpen, setNewDmOpen] = useState(false);

  const selectedPeer = useMemo<string | null>(() => {
    if (!recipient?.trim()) return null;
    try {
      const decoded = nip19.decode(recipient.trim());
      if (decoded.type === 'npub') return decoded.data;
      if (decoded.type === 'nprofile') return decoded.data.pubkey;
    } catch {
      // Invalid route param is handled below.
    }
    return null;
  }, [recipient]);

  // Redirect away from invalid recipient identifiers.
  useEffect(() => {
    if (recipient && !selectedPeer) {
      navigate('/messages', { replace: true });
      toast({
        title: 'Invalid recipient',
        description: 'The message link did not contain a valid npub or nprofile.',
        variant: 'destructive',
      });
    }
  }, [recipient, selectedPeer, navigate, toast]);

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
          if (selectedPeer === peerPubkey) navigate('/messages');
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

  function handleStartConversation(input: string) {
    navigate(`/messages/${input}`);
    setNewDmOpen(false);
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
      {!selectedPeer && (
        <>
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border flex-shrink-0">
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail size={20} className="text-primary" />
                <h1 className="text-lg font-bold">Messages</h1>
                <Lock size={14} className="text-green-500 ml-1" title="End-to-end encrypted" />
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setNewDmOpen(true)}>
                <Plus size={16} />
                New
              </Button>
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
                  <Button
                    size="sm"
                    className="gap-1.5 mt-4"
                    onClick={() => setNewDmOpen(true)}
                  >
                    <Plus size={16} />
                    Start a conversation
                  </Button>
                </CardContent>
              </Card>
            )}

            {conversations.map((conv) => (
              <ConversationListItem
                key={conv.peerPubkey}
                conv={conv}
                selectedPeer={selectedPeer}
                onSelect={(peerNpub) => navigate(`/messages/${peerNpub}`)}
                onDelete={() => handleDelete(conv.peerPubkey)}
                isDeleting={isDeleting}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Chat view — fills the full height with sticky compose bar ── */}
      {selectedPeer && (
        <ChatView
          peerPubkey={selectedPeer}
          messages={selectedConv?.messages ?? []}
          myPubkey={user.pubkey}
          onBack={() => navigate('/messages')}
        />
      )}

      <NewConversationDialog
        open={newDmOpen}
        onOpenChange={setNewDmOpen}
        onStart={handleStartConversation}
      />
    </div>
  );
}
