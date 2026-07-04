import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useState } from 'react';
import { Building2, Shield, CheckCircle, XCircle, Clock, Users, RefreshCw } from 'lucide-react';
import { useCommunityMeta, useCommunityFeed, useCommunityPending, useIsModerator } from '@/hooks/useCommunity';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { useMixstr } from '@/hooks/useMixstr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import type { NostrEvent } from '@nostrify/nostrify';
import { relativeTime } from '@/lib/postUtils';

/** Parse community address from URL param (supports naddr or raw "34550:pubkey:dtag") */
function parseCommunityAddr(param: string): string {
  try {
    if (param.startsWith('naddr1')) {
      const { nip19 } = require('nostr-tools');
      const decoded = nip19.decode(param);
      if (decoded.type === 'naddr') {
        return `${decoded.data.kind}:${decoded.data.pubkey}:${decoded.data.identifier}`;
      }
    }
  } catch {}
  return decodeURIComponent(param);
}

export function CommunityPage() {
  const { addr } = useParams<{ addr: string }>();
  const communityAddr = addr ? parseCommunityAddr(addr) : '';
  const { feedViewModes, setFeedViewMode } = useMixstr();
  const feedKey = `community:${communityAddr}`;
  const mode = feedViewModes[feedKey] ?? 'short';

  const { data: communityEvent, isLoading: metaLoading } = useCommunityMeta(communityAddr);
  const { data: feed = [], isLoading: feedLoading, refetch } = useCommunityFeed(communityAddr);
  const isModerator = useIsModerator(communityEvent);
  const { data: pending = [], isLoading: pendingLoading } = useCommunityPending(communityAddr, isModerator);

  const name = communityEvent?.tags.find(([t]) => t === 'name')?.[1]
    ?? communityEvent?.tags.find(([t]) => t === 'd')?.[1]
    ?? 'Community';
  const description = communityEvent?.tags.find(([t]) => t === 'description')?.[1];
  const image = communityEvent?.tags.find(([t]) => t === 'image')?.[1];
  const moderators = communityEvent?.tags.filter(([t, , , role]) => t === 'p' && (!role || role === 'moderator' || role === 'admin')) ?? [];

  useSeoMeta({ title: `${name} · Mixstr` });

  return (
    <div className="max-w-2xl mx-auto">
      {/* Community header */}
      <div className="border-b border-border">
        {/* Banner / image */}
        <div className="h-24 bg-gradient-to-r from-primary/20 to-primary/5 relative">
          {image && (
            <img src={image} alt={name} className="w-full h-full object-cover absolute inset-0" />
          )}
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-end justify-between -mt-8 mb-3">
            <div className="w-16 h-16 rounded-xl border-4 border-background overflow-hidden bg-card flex items-center justify-center">
              {image ? (
                <img src={image} alt={name} className="w-full h-full object-cover" />
              ) : (
                <Building2 size={24} className="text-primary" />
              )}
            </div>
            {isModerator && (
              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs gap-1">
                <Shield size={11} />
                Moderator
              </Badge>
            )}
          </div>

          {metaLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground">{name}</h1>
              {description && (
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              )}
              {moderators.length > 0 && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Users size={12} />
                  <span>{moderators.length} moderator{moderators.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Moderator panel + feed tabs */}
      {isModerator ? (
        <Tabs defaultValue="approved">
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 pt-2">
            <TabsList className="bg-muted mb-2">
              <TabsTrigger value="approved" className="text-xs">
                Approved
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-xs flex items-center gap-1">
                Pending
                {pending.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-[9px] rounded-full px-1 min-w-[16px] text-center">
                    {pending.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="moderators" className="text-xs">
                Moderators
              </TabsTrigger>
            </TabsList>
            <div className="pb-2">
              <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
            </div>
          </div>

          <TabsContent value="approved" className="mt-0">
            <FeedView events={feed} mode={mode} isLoading={feedLoading} />
          </TabsContent>

          <TabsContent value="pending" className="mt-0">
            <PendingPostsList posts={pending} communityAddr={communityAddr} isLoading={pendingLoading} />
          </TabsContent>

          <TabsContent value="moderators" className="mt-0">
            <ModeratorsList communityEvent={communityEvent} />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 pt-3 pb-3 flex items-center justify-between">
            <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-primary"
              onClick={() => refetch()}
            >
              <RefreshCw size={15} className={feedLoading ? 'animate-spin' : ''} />
            </Button>
          </div>
          <FeedView events={feed} mode={mode} isLoading={feedLoading} />
        </>
      )}
    </div>
  );
}

function PendingPostsList({
  posts,
  communityAddr,
  isLoading,
}: {
  posts: NostrEvent[];
  communityAddr: string;
  isLoading: boolean;
}) {
  const { mutate: publish } = useNostrPublish();

  const approvePost = (post: NostrEvent) => {
    publish({
      kind: 4550,
      content: JSON.stringify(post),
      tags: [
        ['a', communityAddr],
        ['e', post.id],
        ['p', post.pubkey],
        ['k', String(post.kind)],
      ],
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-4 border-b border-border space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <Card className="border-dashed mx-4 my-8">
        <CardContent className="py-12 text-center">
          <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No pending posts to review.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {posts.map((post) => (
        <PendingPostItem key={post.id} post={post} onApprove={() => approvePost(post)} />
      ))}
    </div>
  );
}

function PendingPostItem({ post, onApprove }: { post: NostrEvent; onApprove: () => void }) {
  const author = useAuthor(post.pubkey);
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || post.pubkey.slice(0, 10) + '…';

  return (
    <div className="px-4 py-4 border-b border-border">
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={meta?.picture} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
            {displayName[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{displayName}</p>
          <p className="text-xs text-muted-foreground">{relativeTime(post.created_at)}</p>
        </div>
        <Badge variant="secondary" className="text-xs flex items-center gap-1">
          <Clock size={10} />
          Pending
        </Badge>
      </div>
      <p className="text-sm text-foreground/80 line-clamp-4 mb-3">{post.content}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onApprove}
          className="gap-1.5 bg-green-600 hover:bg-green-500 text-white h-7 text-xs"
        >
          <CheckCircle size={13} />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 h-7 text-xs"
        >
          <XCircle size={13} />
          Reject
        </Button>
      </div>
    </div>
  );
}

function ModeratorsList({ communityEvent }: { communityEvent: NostrEvent | undefined }) {
  if (!communityEvent) return null;
  const mods = communityEvent.tags.filter(([t]) => t === 'p');

  return (
    <div className="px-4 py-4 space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Moderators ({mods.length})
      </h2>
      {mods.map(([, pubkey, , role]) => (
        <ModeratorItem key={pubkey} pubkey={pubkey} role={role} />
      ))}
    </div>
  );
}

function ModeratorItem({ pubkey, role }: { pubkey: string; role?: string }) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || pubkey.slice(0, 16) + '…';

  return (
    <div className="flex items-center gap-3">
      <Avatar className="w-9 h-9 flex-shrink-0">
        <AvatarImage src={meta?.picture} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
          {displayName[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{displayName}</p>
        {meta?.nip05 && (
          <p className="text-xs text-muted-foreground truncate">{meta.nip05}</p>
        )}
      </div>
      {role && (
        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary capitalize">
          {role}
        </Badge>
      )}
    </div>
  );
}
