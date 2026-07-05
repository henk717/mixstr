import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useAuthor } from '@/hooks/useAuthor';
import { useMixstr } from '@/hooks/useMixstr';
import { useProfileFeed } from '@/hooks/useProfileFeed';
import { useProfileRepliesFeed } from '@/hooks/useProfileRepliesFeed';
import { useProfileFollowing } from '@/hooks/useProfileFollowing';
import { useFollowing } from '@/hooks/useFollowing';
import { useFollowMutation } from '@/hooks/useFollowMutation';
import { useNip05Verification } from '@/hooks/useNip05Verification';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmojifiedText } from '@/components/CustomEmoji';
import { NoteContent } from '@/components/NoteContent';
import { Lightbox } from '@/components/ImageGallery';
import { Link } from 'react-router-dom';
import {
  Globe,
  Zap,
  BadgeCheck,
  UserPlus,
  UserCheck,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

interface ProfilePageProps {
  pubkey: string;
}

// ─── Following tab ────────────────────────────────────────────────────────────

function FollowingList({ pubkey }: { pubkey: string }) {
  const { data: followingPubkeys = [], isLoading } = useProfileFollowing(pubkey);

  if (isLoading) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (followingPubkeys.length === 0) {
    return (
      <div className="border-dashed border border-border rounded-lg mx-4 my-8">
        <div className="py-12 px-8 text-center">
          <p className="text-muted-foreground max-w-sm mx-auto text-sm">
            Not following anyone yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {followingPubkeys.map((pk) => (
        <FollowingItem key={pk} pubkey={pk} />
      ))}
    </div>
  );
}

function FollowingItem({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  const event = author.data?.event;
  const profileUrl = useProfileUrl(pubkey, meta);

  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || pubkey.slice(0, 16) + '…';

  return (
    <Link
      to={profileUrl}
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      <Avatar className="w-10 h-10 flex-shrink-0">
        <AvatarImage src={meta?.picture} />
        <AvatarFallback className="bg-primary/20 text-primary font-bold text-sm">
          {author.isLoading ? '?' : displayName[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">
          {event ? (
            <EmojifiedText tags={event.tags}>{displayName}</EmojifiedText>
          ) : (
            displayName
          )}
        </p>
        {meta?.nip05 && (
          <p className="text-xs text-muted-foreground truncate">{meta.nip05}</p>
        )}
        {meta?.about && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {meta.about}
          </p>
        )}
      </div>
    </Link>
  );
}

// ─── A lightweight "about" renderer that handles Nostr mentions + emojis ─────

/**
 * Renders a profile's `about` text, turning nostr: mentions and bare
 * npub/nprofile identifiers into real links, resolving custom emoji
 * shortcodes from the kind-0 event tags, but suppressing media embeds
 * and link preview cards (we don't want a wall of previews in a bio).
 */
function ProfileAbout({ event }: { event: NostrEvent }) {
  return (
    <NoteContent
      event={event}
      className="text-sm text-foreground leading-relaxed"
      disableEmbeds
    />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ProfileTab = 'posts' | 'replies' | 'following';

export function ProfilePage({ pubkey }: ProfilePageProps) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  const profileEvent = author.data?.event;

  const { feedViewModes, setFeedViewMode } = useMixstr();
  const feedKey = `profile:${pubkey}`;
  const mode = feedViewModes[feedKey] ?? 'short';

  const { user } = useCurrentUser();
  const { data: followingList = [] } = useFollowing();
  const followMutation = useFollowMutation();
  const isFollowing = followingList.includes(pubkey);
  const isOwnProfile = user?.pubkey === pubkey;

  const { data: isVerified } = useNip05Verification(meta?.nip05, pubkey);

  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);

  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || pubkey.slice(0, 16) + '…';

  useSeoMeta({ title: `${displayName} · Mixstr` });

  // Posts-only feed (no replies to other people)
  const {
    events: postEvents,
    isLoading: postsLoading,
    isFetchingOlder: postsFetchingOlder,
    hasMore: postsHasMore,
    fetchNextPage: postsFetchNext,
  } = useProfileFeed(pubkey);

  // Posts + replies feed
  const {
    events: replyEvents,
    isLoading: repliesLoading,
    isFetchingOlder: repliesFetchingOlder,
    hasMore: repliesHasMore,
    fetchNextPage: repliesFetchNext,
  } = useProfileRepliesFeed(pubkey);

  const replyPages = useMemo(() => (replyEvents.length > 0 ? [replyEvents] : []), [replyEvents]);

  // ── Build a synthetic kind-0 event for ProfileAbout ──────────────────────
  // We need a real NostrEvent to pass to NoteContent, but `about` isn't a
  // note — we construct a fake kind-0 so NoteContent can still resolve
  // emoji tags from the real profile event.
  const aboutEvent: NostrEvent | null = useMemo(() => {
    if (!meta?.about) return null;
    return {
      id: '',
      pubkey,
      created_at: profileEvent?.created_at ?? 0,
      kind: 0,
      tags: profileEvent?.tags ?? [],
      content: meta.about,
      sig: '',
    };
  }, [meta?.about, pubkey, profileEvent]);

  // Lightning address display helper
  const lightningAddress = meta?.lud16 || meta?.lud06;
  const lightningDisplay = meta?.lud16 ?? (meta?.lud06 ? meta.lud06.slice(0, 24) + '…' : null);

  // Encode npub for copy-friendly display
  const npub = useMemo(() => {
    try { return nip19.npubEncode(pubkey); } catch { return pubkey.slice(0, 16) + '…'; }
  }, [pubkey]);

  const handleFollowToggle = () => {
    if (!user) return;
    followMutation.mutate({ pubkey, action: isFollowing ? 'unfollow' : 'follow' });
  };

  // "Posts only" = exclude events that are replies to other users' posts.
  // A reply is any kind-1 event that has an 'e' tag referencing another post.
  // Other kinds (reposts, longform, etc.) are kept regardless.
  const postsOnlyEvents = useMemo(
    () => postEvents.filter((ev) => ev.kind !== 1 || !ev.tags.some(([t]) => t === 'e')),
    [postEvents],
  );
  const postsOnlyPages = useMemo(
    () => (postsOnlyEvents.length > 0 ? [postsOnlyEvents] : []),
    [postsOnlyEvents],
  );

  const currentFeedLoading = activeTab === 'posts' ? postsLoading : repliesLoading;
  const totalEvents = activeTab === 'posts' ? postsOnlyEvents.length : replyEvents.length;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Banner */}
      <div className="relative">
        {meta?.banner ? (
          <div className="h-36 sm:h-44 overflow-hidden">
            <img src={meta.banner} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="h-36 sm:h-44 bg-gradient-to-br from-primary/30 via-primary/10 to-muted" />
        )}

        {/* Avatar + action row */}
        <div className="px-4 -mt-12 flex items-end justify-between">
          {meta?.picture ? (
            <button
              type="button"
              onClick={() => setAvatarLightboxOpen(true)}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label="View full avatar"
            >
              <Avatar className="w-24 h-24 border-4 border-background shadow-md cursor-pointer hover:opacity-90 transition-opacity">
                <AvatarImage src={meta.picture} />
                <AvatarFallback className="bg-primary/20 text-primary text-3xl font-black">
                  {author.isLoading ? '?' : displayName[0]?.toUpperCase() ?? '?'}
                </AvatarFallback>
              </Avatar>
            </button>
          ) : (
            <Avatar className="w-24 h-24 border-4 border-background shadow-md">
              <AvatarImage src={meta?.picture} />
              <AvatarFallback className="bg-primary/20 text-primary text-3xl font-black">
                {author.isLoading ? '?' : displayName[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
          )}

          {!isOwnProfile && user && (
            <Button
              variant={isFollowing ? 'outline' : 'default'}
              size="sm"
              className="mb-1 gap-1.5"
              onClick={handleFollowToggle}
              disabled={followMutation.isPending}
            >
              {followMutation.isPending ? (
                <span className="animate-pulse">…</span>
              ) : isFollowing ? (
                <>
                  <UserCheck size={14} />
                  Following
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  Follow
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {meta?.picture && avatarLightboxOpen && (
        <Lightbox
          images={[meta.picture]}
          currentIndex={0}
          onClose={() => setAvatarLightboxOpen(false)}
        />
      )}

      {/* Profile info */}
      <div className="px-4 pt-3 pb-4 border-b border-border space-y-2">
        {author.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : (
          <>
            {/* Name + verification badge */}
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-xl font-bold text-foreground leading-tight">
                {profileEvent ? (
                  <EmojifiedText tags={profileEvent.tags}>{displayName}</EmojifiedText>
                ) : (
                  displayName
                )}
              </h1>
              {isVerified && (
                <BadgeCheck
                  size={18}
                  className="text-primary flex-shrink-0"
                  aria-label="NIP-05 verified"
                />
              )}
            </div>

            {/* NIP-05 identifier */}
            {meta?.nip05 && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                {isVerified && (
                  <BadgeCheck size={13} className="text-primary flex-shrink-0" />
                )}
                <span className={isVerified ? 'text-primary' : ''}>{meta.nip05}</span>
              </p>
            )}

            {/* Truncated npub */}
            <p className="text-xs text-muted-foreground font-mono break-all">
              {npub.slice(0, 20)}…
            </p>

            {/* About / bio */}
            {aboutEvent && (
              <div className="pt-1">
                <ProfileAbout event={aboutEvent} />
              </div>
            )}

            {/* Extra fields row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
              {meta?.website && (
                <a
                  href={meta.website.startsWith('http') ? meta.website : `https://${meta.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Globe size={12} />
                  {meta.website.replace(/^https?:\/\//, '')}
                </a>
              )}

              {lightningAddress && (
                <span className="flex items-center gap-1 text-xs text-amber-500">
                  <Zap size={12} />
                  {lightningDisplay}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ProfileTab)}
      >
        {/* Tab bar + view-mode switcher (two-row sticky header) */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
          {/* Row 1: tabs */}
          <div className="px-4">
            <TabsList className="h-auto bg-transparent p-0 gap-0 w-full justify-start">
              <TabsTrigger
                value="posts"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors"
              >
                Posts
              </TabsTrigger>
              <TabsTrigger
                value="replies"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors"
              >
                Posts & Replies
              </TabsTrigger>
              <TabsTrigger
                value="following"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors"
              >
                Following
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Row 2: view-mode switcher (only for feed tabs) */}
          {activeTab !== 'following' && (
            <div className="px-4 py-1.5 flex items-center gap-2 border-t border-border/50">
              <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
              {!currentFeedLoading && totalEvents > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                  {totalEvents}
                </Badge>
              )}
            </div>
          )}
        </div>

        <TabsContent value="posts" className="mt-0">
          <FeedView
            pages={postsOnlyPages}
            mode={mode}
            isLoading={postsLoading}
            hasNextPage={postsHasMore}
            isFetchingNextPage={postsFetchingOlder}
            fetchNextPage={postsFetchNext}
          />
        </TabsContent>

        <TabsContent value="replies" className="mt-0">
          <FeedView
            pages={replyPages}
            mode={mode}
            isLoading={repliesLoading}
            hasNextPage={repliesHasMore}
            isFetchingNextPage={repliesFetchingOlder}
            fetchNextPage={repliesFetchNext}
          />
        </TabsContent>

        <TabsContent value="following" className="mt-0">
          <FollowingList pubkey={pubkey} />
        </TabsContent>
      </Tabs>

      {/* Unfollow confirmation row (shown when hovering the "Following" button) */}
      {!isOwnProfile && !user && (
        <div className="px-4 pb-4 -mt-2">
          <p className="text-xs text-muted-foreground">
            <Link to="/" className="text-primary hover:underline">Log in</Link> to follow this profile.
          </p>
        </div>
      )}
    </div>
  );
}
