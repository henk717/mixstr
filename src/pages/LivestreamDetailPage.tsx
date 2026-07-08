import { useState, useRef, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useNavigate } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventById } from '@/hooks/useEventById';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useMuteList } from '@/hooks/useMuteList';
import { getLivestreamInfo } from '@/lib/postUtils';
import { ChatMessage } from '@/components/feed/ChatMessage';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Wifi, Users, Send, MessageCircle, ExternalLink, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LivestreamDetailPageProps {
  pubkey: string;
  dTag: string;
  /** Relay URLs from the NIP-19 identifier that are known to have this stream. */
  relays?: string[];
}

// ── Main page ────────────────────────────────────────────────────────────────

export function LivestreamDetailPage({ pubkey, dTag, relays }: LivestreamDetailPageProps) {
  const { nostr } = useNostr();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending: isSending } = useNostrPublish();
  const [chatMsg, setChatMsg] = useState('');
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch the livestream event, probing any relay hints first.
  const { data: event, isLoading } = useEventById({
    eventId: dTag,
    pubkey,
    kind: 30311,
    relayHints: relays,
    timeoutMs: 8000,
    staleTime: 5 * 1000,
    refetchInterval: 30 * 1000, // Re-fetch every 30s to get viewer count updates
  });

  const info = event ? getLivestreamInfo(event) : null;
  const hostPubkey = info?.hostPubkey ?? pubkey;
  const hostAuthor = useAuthor(hostPubkey);
  const hostMeta = hostAuthor.data?.metadata;
  const hostNpub = nip19.npubEncode(hostPubkey);
  const hostName = hostMeta?.display_name || hostMeta?.name || hostPubkey.slice(0, 10) + '…';

  const isLive = info?.status === 'live';

  useSeoMeta({ title: info ? `${info.title} · Mixstr` : 'Livestream · Mixstr' });

  // The naddr coordinate used as the 'a' tag for live chat messages
  const aTagValue = `30311:${pubkey}:${dTag}`;

  // Get current user's blocklist
  const { isMuted: isUserMuted, isLoading: isUserBlocklistLoading } = useMuteList();

  // Fetch streamer's blocklist (kind 10000) to combine with user's blocklist
  const { data: streamerBlocklist = new Set<string>(), isLoading: isStreamerBlocklistLoading } = useQuery<Set<string>>({
    queryKey: ['nostr', 'streamer-blocklist', hostPubkey],
    queryFn: async ({ signal }) => {
      const [ev] = await nostr.query(
        [{ kinds: [10000], authors: [hostPubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      if (!ev) return new Set<string>();
      const blocked = new Set<string>();
      for (const tag of ev.tags) {
        if (tag[0] === 'p' && tag[1]) blocked.add(tag[1]);
      }
      return blocked;
    },
    enabled: !!hostPubkey,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch live chat messages (kind 1311 tagged with this stream's 'a' coordinate)
  const { data: chatMessages = [], isLoading: isChatLoading } = useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'live-chat', aTagValue],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [1311], '#a': [aTagValue], limit: 200 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return events.sort((a, b) => a.created_at - b.created_at);
    },
    enabled: !!event,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
  });

  // Combined filtering: hide messages from users blocked by either the viewer or the streamer
  const isBlockedByViewer = (event: NostrEvent) => isUserMuted(event);
  const isBlockedByStreamer = (event: NostrEvent) => streamerBlocklist.has(event.pubkey);
  const isBlocked = (event: NostrEvent) => isBlockedByViewer(event) || isBlockedByStreamer(event);

  // Wait for all blocklists to load before filtering
  const isBlocklistsLoading = isUserBlocklistLoading || isStreamerBlocklistLoading;
  const isLoadingMessages = isChatLoading || isBlocklistsLoading;
  const filteredChatMessages = isLoadingMessages ? [] : chatMessages.filter((msg) => !isBlocked(msg));

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  async function handleSendChat() {
    if (!chatMsg.trim() || !event) return;
    try {
      await publish({
        kind: 1311,
        content: chatMsg.trim(),
        tags: [['a', aTagValue, '', 'root']],
      });
      setChatMsg('');
    } catch {
      // ignore
    }
  }

  function handleChatKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  }

   return (
     <div className="relative">
       {/* Header */}
       <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
         <Button variant="ghost" size="icon" className="w-8 h-8 flex-shrink-0" onClick={() => navigate(-1)}>
           <ArrowLeft size={18} />
         </Button>
         <h1 className="text-base font-bold truncate flex-1">
           {isLoading ? 'Loading…' : (info?.title ?? 'Livestream')}
         </h1>
         {isLive && (
           <Badge className="bg-red-600 text-white border-0 gap-1 text-xs font-bold flex-shrink-0">
             <Wifi size={10} className="animate-pulse" />
             LIVE
           </Badge>
         )}
       </div>

       {/* Loading */}
       {isLoading && (
         <div className="p-4 space-y-4">
           <Skeleton className="w-full aspect-video rounded-xl" />
           <Skeleton className="h-4 w-2/3" />
           <Skeleton className="h-4 w-1/3" />
         </div>
       )}

       {/* Not found */}
       {!isLoading && !event && (
         <Card className="border-dashed mx-4 my-8">
           <CardContent className="py-12 text-center text-muted-foreground text-sm">
             Stream not found or may have ended.
           </CardContent>
         </Card>
       )}

        {event && info && (
          <>
            {/* Main content area */}
            <div className={`max-w-full px-4 pb-4 ${isChatCollapsed ? 'lg:pr-[64px]' : 'lg:pr-[336px]'}`}>
             {/* Video player - full width */}
             <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-lg">
               {info.streamUrl ? (
                 <video
                   key={info.streamUrl}
                   src={info.streamUrl}
                   controls
                   autoPlay
                   className="w-full h-full object-contain"
                   playsInline
                 />
               ) : info.thumbnail ? (
                 <div className="relative w-full h-full">
                   <img
                     src={info.thumbnail}
                     alt={info.title}
                     className="w-full h-full object-cover"
                   />
                   <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                     <Wifi size={40} className={isLive ? 'text-red-400 animate-pulse' : 'text-muted-foreground'} />
                     <p className="text-white/80 text-sm">
                       {isLive ? 'Stream player not available in browser' : 'Stream has ended'}
                     </p>
                     {info.streamUrl && (
                       <a
                         href={info.streamUrl}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                       >
                         <ExternalLink size={12} />
                         Open stream directly
                       </a>
                     )}
                   </div>
                 </div>
               ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-red-950 to-black">
                   <Wifi size={48} className={isLive ? 'text-red-500 animate-pulse' : 'text-muted-foreground'} />
                   <p className="text-white/60 text-sm">
                     {isLive ? 'No stream URL available' : 'Stream has ended'}
                   </p>
                 </div>
               )}
             </div>

             {/* Stream info/description */}
             <div className="py-4">
               <h2 className="text-lg font-bold text-foreground leading-snug">{info.title}</h2>

               <div className="flex items-center gap-3 mt-2 flex-wrap">
                 {/* Host */}
                 <Link to={`/${hostNpub}`} className="flex items-center gap-2 group">
                   <Avatar className="w-7 h-7">
                     <AvatarImage src={hostMeta?.picture} />
                     <AvatarFallback className="text-xs bg-primary/20 text-primary font-bold">
                       {hostName[0].toUpperCase()}
                     </AvatarFallback>
                   </Avatar>
                   <span className="text-sm font-semibold group-hover:text-primary transition-colors">
                     {hostName}
                   </span>
                 </Link>

                 {/* Viewer count */}
                 {info.viewers != null && (
                   <div className="flex items-center gap-1 text-sm text-muted-foreground">
                     <Users size={13} />
                     {info.viewers.toLocaleString()} watching
                   </div>
                 )}

                 {/* Status */}
                 {info.status === 'planned' && (
                   <Badge className="bg-blue-600 text-white border-0 text-xs">Upcoming</Badge>
                 )}
                 {info.status === 'ended' && (
                   <Badge variant="secondary" className="text-xs">Ended</Badge>
                 )}

                  <Link to={`/${hostNpub}`}>
                    <Button size="sm" className="h-7 text-xs">
                      Follow
                    </Button>
                  </Link>
               </div>

               {/* Summary */}
               {event.tags.find(([t]) => t === 'summary')?.[1] && (
                 <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                   {event.tags.find(([t]) => t === 'summary')![1]}
                 </p>
               )}

               {/* Hashtags */}
               {event.tags.filter(([t]) => t === 't').length > 0 && (
                 <div className="flex flex-wrap gap-1.5 mt-2">
                   {event.tags.filter(([t]) => t === 't').map(([, tag]) => (
                     <Badge key={tag} variant="secondary" className="text-xs">
                       #{tag}
                     </Badge>
                   ))}
                 </div>
               )}
             </div>
           </div>

            {/* Desktop-only collapsable chat sidebar */}
            <Collapsible open={!isChatCollapsed} onOpenChange={(open) => setIsChatCollapsed(!open)}>
              <div className="hidden lg:block fixed right-0 top-14 h-[calc(100vh-3.5rem)] border-l border-border bg-background shadow-lg transition-all duration-300"
                style={{ width: isChatCollapsed ? '3rem' : '20rem', maxWidth: isChatCollapsed ? '3rem' : '24rem' }}>
                {/* Chat header with collapse toggle - always visible */}
                <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 bg-card h-11">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0 hover:bg-muted">
                      {isChatCollapsed ? (
                        <PanelLeft size={14} className="text-primary" />
                      ) : (
                        <PanelLeftClose size={14} className="text-primary" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  {!isChatCollapsed && (
                    <>
                      <MessageCircle size={14} className="text-primary" />
                      <span className="text-sm font-semibold">Live Chat</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {isLoadingMessages
                          ? 'Loading…'
                          : `${filteredChatMessages.length} ${filteredChatMessages.length === 1 ? 'message' : 'messages'}`
                        }
                      </span>
                    </>
                  )}
                </div>

                {/* Chat body - messages and input inside collapsible */}
                <CollapsibleContent forceMount className="absolute left-0 right-0 overflow-hidden"
                  style={{ top: '2.75rem', bottom: '0', width: isChatCollapsed ? '3rem' : '20rem', maxWidth: isChatCollapsed ? '3rem' : '24rem' }}>
                  {!isChatCollapsed && (
                    <div className="h-full flex flex-col">
                      {/* Messages - scrollable area */}
                      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0">
                        {isLoadingMessages && (
                          <div className="space-y-1">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="py-1.5 px-1">
                                <div className="flex gap-2">
                                  <Skeleton className="w-16 h-3 flex-shrink-0" />
                                  <Skeleton className="h-3 flex-1" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {!isLoadingMessages && filteredChatMessages.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-6">
                            {isLive ? 'No messages yet. Be the first to chat!' : 'No chat messages for this stream.'}
                          </p>
                        )}
                        {!isLoadingMessages &&
                          filteredChatMessages.map((msg) => (
                            <ChatMessage key={msg.id} event={msg} />
                          ))}
                        <div ref={chatEndRef} />
                      </div>

                      {/* Chat input - fixed at bottom of sidebar */}
                      {isLive && (
                        <div className="px-3 py-2 border-t border-border flex gap-2 flex-shrink-0 bg-background">
                          {user ? (
                            <>
                              <Input
                                value={chatMsg}
                                onChange={(e) => setChatMsg(e.target.value)}
                                onKeyDown={handleChatKey}
                                placeholder="Say something…"
                                className="h-8 text-sm flex-1"
                                disabled={isSending}
                              />
                              <Button
                                size="icon"
                                className="h-8 w-8 flex-shrink-0 rounded-full"
                                onClick={handleSendChat}
                                disabled={!chatMsg.trim() || isSending}
                              >
                                <Send size={13} />
                              </Button>
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground py-1">
                              Log in to chat
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>

           {/* Mobile chat - below content */}
           <div className="lg:hidden px-4 pb-4">
             <div className="border rounded-xl overflow-hidden flex flex-col" style={{ height: 'clamp(300px, 40vh, 520px)' }}>
               {/* Chat header */}
               <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 bg-card flex-shrink-0">
                 <MessageCircle size={14} className="text-primary" />
                 <span className="text-sm font-semibold">Live Chat</span>
                 <span className="text-xs text-muted-foreground ml-auto">
                   {isLoadingMessages
                     ? 'Loading…'
                     : `${filteredChatMessages.length} ${filteredChatMessages.length === 1 ? 'message' : 'messages'}`
                   }
                 </span>
               </div>

               {/* Messages */}
               <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0">
                 {isLoadingMessages && (
                   <div className="space-y-1">
                     {[1, 2, 3].map((i) => (
                       <div key={i} className="py-1.5 px-1">
                         <div className="flex gap-2">
                           <Skeleton className="w-16 h-3 flex-shrink-0" />
                           <Skeleton className="h-3 flex-1" />
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
                 {!isLoadingMessages && filteredChatMessages.length === 0 && (
                   <p className="text-xs text-muted-foreground text-center py-6">
                     {isLive ? 'No messages yet. Be the first to chat!' : 'No chat messages for this stream.'}
                   </p>
                 )}
                 {!isLoadingMessages &&
                   filteredChatMessages.map((msg) => (
                     <ChatMessage key={msg.id} event={msg} />
                   ))}
                 <div ref={chatEndRef} />
               </div>

               {/* Chat input */}
               {isLive && (
                 <div className="px-3 py-2 border-t border-border flex gap-2 flex-shrink-0">
                   {user ? (
                     <>
                       <Input
                         value={chatMsg}
                         onChange={(e) => setChatMsg(e.target.value)}
                         onKeyDown={handleChatKey}
                         placeholder="Say something…"
                         className="h-8 text-sm flex-1"
                         disabled={isSending}
                       />
                       <Button
                         size="icon"
                         className="h-8 w-8 flex-shrink-0 rounded-full"
                         onClick={handleSendChat}
                         disabled={!chatMsg.trim() || isSending}
                       >
                         <Send size={13} />
                       </Button>
                     </>
                   ) : (
                     <p className="text-xs text-muted-foreground py-1">
                       Log in to chat
                     </p>
                   )}
                 </div>
               )}
             </div>
           </div>
         </>
       )}
     </div>
   );
}
