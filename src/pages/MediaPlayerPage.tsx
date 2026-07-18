import { useSeoMeta } from '@unhead/react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, ExternalLink, Rss, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ListMusic, X } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { useAuthor } from '@/hooks/useAuthor';
import { useResolvedEvent } from '@/hooks/useResolvedEvent';
import { isRssSyntheticEvent, getRssItemInfo } from '@/lib/rssAdapter';
import {
  getEventTitle,
  getCoverImage,
  extractVideos,
  extractAudio,
  relativeTime,
  eventToNevent,
  getAudioTrackInfo,
} from '@/lib/postUtils';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { NoteContent } from '@/components/NoteContent';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { cn } from '@/lib/utils';

interface MediaPlayerPageProps {}

export function MediaPlayerPage({}: MediaPlayerPageProps) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { nostr } = useNostr();

  // Support two modes:
  // 1. Direct media URL via query params: /player?media=...&dest=...
  // 2. nevent/note ID via path param: /player/nevent1...
  
  const mediaUrlFromQuery = searchParams.get('media');
  const destUrlFromQuery = searchParams.get('dest');
  const hasQueryParams = !!mediaUrlFromQuery;

  // Decode the nevent or note parameter (fallback mode)
  const decoded = id ? nip19.decode(id) : null;
  const eventId = decoded?.type === 'nevent' || decoded?.type === 'note' ? decoded.data.id : id;
  const authorPubkey = decoded?.type === 'nevent' ? (decoded.data as { author?: string }).author : undefined;

  const { data: event, isLoading } = useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'event', eventId],
    queryFn: async ({ signal }) => {
      if (!eventId) return null;
      const filters = [{ kinds: [1], '#e': [eventId], limit: 1 }];
      const events = await nostr.query(filters, { signal });
      return events[0] ?? null;
    },
    enabled: !!eventId && !hasQueryParams,
    staleTime: 5 * 60 * 1000,
  });

  // Resolve repost/community-approval wrappers
  const resolvedEvent = event ? (JSON.parse(event.content ?? '{}') as NostrEvent) : event;
  const displayEvent = resolvedEvent || event;

  // Get media info from event (fallback mode)
  const videos = displayEvent ? extractVideos(displayEvent) : [];
  const audios = displayEvent ? extractAudio(displayEvent) : [];
  const mediaUrlFromEvent = videos[0] || audios[0];
  const isVideoFromEvent = videos.length > 0;
  const coverImageFromEvent = displayEvent ? getCoverImage(displayEvent) : undefined;
  const titleFromEvent = displayEvent ? getEventTitle(displayEvent) : undefined;
  const rssInfoFromEvent = displayEvent ? getRssItemInfo(displayEvent) : null;

  // Use query params if available, otherwise fall back to event data
  const mediaUrl = mediaUrlFromQuery || mediaUrlFromEvent;
  const isVideo = hasQueryParams 
    ? /\.(mp4|webm|mov|mkv)/i.test(mediaUrlFromQuery!)
    : isVideoFromEvent;
  const coverImage = hasQueryParams ? undefined : coverImageFromEvent;
  const title = hasQueryParams 
    ? new URL(mediaUrlFromQuery!).pathname.split('/').pop() || 'Media Player'
    : titleFromEvent;
  
  // Use destination URL for comments if provided, otherwise use RSS link from event
  const commentRootUrl = destUrlFromQuery 
    ? new URL(destUrlFromQuery)
    : rssInfoFromEvent?.link ? new URL(rssInfoFromEvent.link) : undefined;

  // For display purposes
  const displayTitle = hasQueryParams 
    ? (new URL(mediaUrlFromQuery!).hostname || 'Media')
    : (titleFromEvent ?? displayEvent?.content.slice(0, 50));

  useSeoMeta({
    title: `${title ?? 'Media'} · Player · Mixstr`,
  });

  if (isLoading && !hasQueryParams) {
    return <MediaPlayerSkeleton />;
  }

  if (!mediaUrl) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            Media not found or could not be loaded.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <BackButton />
          <h1 className="text-base font-semibold truncate">Player</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-4 py-6">
        {/* Main content - video player and info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video/Audio Player */}
          <MediaPlayer
            url={mediaUrl}
            isVideo={isVideo}
            title={title ?? displayEvent.content.slice(0, 60)}
            coverImage={coverImage}
          />

           {/* Video Info */}
           <Card>
             <CardContent className="p-4 space-y-4">
               <div>
                 <h1 className="text-xl font-bold text-foreground line-clamp-2">
                   {title}
                 </h1>
               </div>

               {/* Author/Source Info */}
               <div className="flex items-center justify-between pt-2 border-t border-border">
                 <div className="flex items-center gap-3">
                   {hasQueryParams ? (
                     // Direct media URL mode (RSS or external)
                     <>
                       <a
                         href={destUrlFromQuery || mediaUrl}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                         title="Open source"
                       >
                         <ExternalLink size={18} className="text-orange-500" />
                       </a>
                       <div>
                         <p className="font-medium text-sm">{displayTitle}</p>
                         <div className="flex items-center gap-2 text-xs text-muted-foreground">
                           <a
                             href={destUrlFromQuery || mediaUrl}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="flex items-center gap-1 hover:text-primary transition-colors"
                           >
                             <ExternalLink size={10} />
                             Open source
                           </a>
                         </div>
                       </div>
                     </>
                   ) : displayEvent && isRssSyntheticEvent(displayEvent) ? (
                     // RSS event from Nostr
                     <>
                       <a
                         href={rssInfoFromEvent?.link}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                         title="Open original article"
                       >
                         <Rss size={18} className="text-orange-500" />
                       </a>
                       <div>
                         <p className="font-medium text-sm">{rssInfoFromEvent?.feedTitle ?? 'RSS Feed'}</p>
                         <div className="flex items-center gap-2 text-xs text-muted-foreground">
                           <span>{relativeTime(displayEvent.created_at)}</span>
                           <a
                             href={rssInfoFromEvent?.link}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="flex items-center gap-1 hover:text-primary transition-colors"
                           >
                             <ExternalLink size={10} />
                             Open source
                           </a>
                         </div>
                       </div>
                     </>
                   ) : displayEvent ? (
                     // Regular Nostr event
                     <>
                       <Link to={`/${nip19.npubEncode(displayEvent.pubkey)}`}>
                         <Avatar className="w-10 h-10">
                           <AvatarImage src={null} />
                           <AvatarFallback className="bg-primary/20 text-primary font-bold">
                             {displayEvent.pubkey.slice(0, 2).toUpperCase()}
                           </AvatarFallback>
                         </Avatar>
                       </Link>
                       <div>
                         <Link
                           to={`/${nip19.npubEncode(displayEvent.pubkey)}`}
                           className="font-medium text-sm hover:text-primary transition-colors"
                         >
                           {displayEvent.pubkey.slice(0, 10)}...
                         </Link>
                         <p className="text-xs text-muted-foreground">
                           {relativeTime(displayEvent.created_at)} ago
                         </p>
                       </div>
                     </>
                   ) : null}
                 </div>

                 {/* Media Type Badge */}
                 <Badge variant={isVideo ? 'default' : 'secondary'}>
                   {isVideo ? 'Video' : 'Audio'}
                 </Badge>
               </div>

               {/* Description (only for Nostr events) */}
               {!hasQueryParams && displayEvent && (
                 <div className="pt-2 border-t border-border">
                   <p className="text-sm font-semibold mb-2">Description</p>
                   <div className="text-sm text-muted-foreground">
                     <NoteContent event={displayEvent} className="line-clamp-4" />
                   </div>
                 </div>
               )}
             </CardContent>
           </Card>

           {/* Comments Section */}
           <div className="pt-4">
             <div className="flex items-center gap-2 mb-4">
               <MessageCircle size={18} className="text-primary" />
               <h2 className="text-lg font-semibold">Comments</h2>
             </div>
             {commentRootUrl ? (
               <CommentsSection
                 root={commentRootUrl}
                 emptyStateMessage="No comments yet"
                 emptyStateSubtitle="Be the first to comment on this media!"
               />
             ) : (
               <Card className="border-dashed">
                 <CardContent className="py-8 text-center text-muted-foreground text-sm">
                   No comments available for this media.
                 </CardContent>
               </Card>
             )}
           </div>
        </div>

         {/* Sidebar - Up Next */}
         <div className="space-y-4">
           <h3 className="text-sm font-semibold">Up Next</h3>
           <UpNextList eventId={displayEvent?.id || mediaUrl} />
         </div>
      </div>
    </div>
  );
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => navigate(-1)}>
      <ArrowLeft size={18} />
    </Button>
  );
}

interface MediaPlayerProps {
  url: string;
  isVideo: boolean;
  title: string;
  coverImage?: string;
}

function MediaPlayer({ url, isVideo, title, coverImage }: MediaPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const { dataUrl: videoFrame, loading: frameLoading } = useVideoThumbnail(isVideo ? url : undefined);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handleTimeUpdate = () => {
      setProgress(media.currentTime / media.duration || 0);
    };

    const handleDurationChange = () => {
      setDuration(media.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('loadedmetadata', handleDurationChange);
    media.addEventListener('ended', handleEnded);

    return () => {
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('loadedmetadata', handleDurationChange);
      media.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const media = mediaRef.current;
    if (!media) return;

    if (isPlaying) {
      media.pause();
    } else {
      media.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (values: number[]) => {
    const media = mediaRef.current;
    if (!media || !duration) return;
    media.currentTime = (values[0] / 100) * duration;
    setProgress(values[0] / 100);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const displayThumbnail = coverImage || videoFrame;

  return (
    <div className="space-y-3">
      {/* Video Player */}
      <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
        {isVideo ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={url}
            className="w-full h-full object-contain"
            onClick={togglePlay}
            preload="metadata"
          />
        ) : (
          <>
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={url}
              preload="metadata"
            />
            {/* Audio visual placeholder */}
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/10">
              {displayThumbnail ? (
                <img
                  src={displayThumbnail}
                  alt={title}
                  className="max-h-full max-w-full rounded-lg shadow-2xl"
                  loading="lazy"
                />
              ) : frameLoading ? (
                <Skeleton className="w-32 h-32 rounded-lg" />
              ) : (
                <Play size={48} className="text-primary/50" />
              )}
            </div>
          </>
        )}

        {/* Play/Pause Overlay */}
        {!isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-16 h-16 rounded-full bg-black/70 flex items-center justify-center backdrop-blur-sm hover:scale-110 transition-transform">
              <Play size={32} className="text-white ml-1" fill="white" />
            </div>
          </div>
        )}

        {/* Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 hover:opacity-100 transition-opacity">
          {/* Progress Bar */}
          <Slider
            value={[progress * 100]}
            onValueChange={handleSeek}
            max={100}
            step={0.1}
            className="mb-3 [&_[role=slider]]:w-3 [&_[role=slider]]:h-3"
          />

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="text-white hover:text-primary transition-colors"
              >
                {isPlaying ? (
                  <Pause size={24} fill="currentColor" />
                ) : (
                  <Play size={24} fill="currentColor" className="ml-0.5" />
                )}
              </button>
              <span className="text-white text-sm">
                {formatTime(progress * duration)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setMuted(!muted)}
                className="text-white hover:text-primary transition-colors"
              >
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <div className="w-20">
                <Slider
                  value={[muted ? 0 : volume * 100]}
                  onValueChange={(v) => {
                    setVolume(v[0] / 100);
                    setMuted(v[0] === 0);
                    const media = mediaRef.current;
                    if (media) {
                      media.volume = v[0] / 100;
                      media.muted = v[0] === 0;
                    }
                  }}
                  max={100}
                  step={1}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpNextList({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { data: relatedEvents = [], isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'up-next', eventId],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [1], limit: 10 }], { signal });
      return events
        .filter((e) => e.id !== eventId && (extractVideos(e).length > 0 || extractAudio(e).length > 0))
        .slice(0, 5);
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden">
            <div className="aspect-video bg-muted" />
            <CardContent className="p-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (relatedEvents.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No more videos
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {relatedEvents.map((event) => {
        const videoUrl = extractVideos(event)[0] || extractAudio(event)[0];
        const thumbnail = getCoverImage(event);
        const videoTitle = getEventTitle(event) ?? event.content.slice(0, 50);
        const isRss = isRssSyntheticEvent(event);
        const rssInfo = getRssItemInfo(event);
        const nevent = eventToNevent(event);

        return (
          <Card
            key={event.id}
            className="cursor-pointer hover:bg-accent/50 transition-colors overflow-hidden"
            onClick={() => navigate(`/player/${nevent}`)}
          >
            <div className="relative aspect-video bg-black">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt={videoTitle}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Play size={24} className="text-muted-foreground" />
                </div>
              )}
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="text-[10px]">
                  {extractVideos(event).length > 0 ? 'Video' : 'Audio'}
                </Badge>
              </div>
            </div>
            <CardContent className="p-3">
              <p className="text-sm font-medium line-clamp-2">{videoTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isRss ? rssInfo?.feedTitle : event.pubkey.slice(0, 8)}...
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MediaPlayerSkeleton() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-4 py-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="aspect-video rounded-xl" />
          <Card>
            <CardContent className="p-4 space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-border">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Skeleton className="h-6 w-24" />
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Skeleton className="h-4 w-20" />
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-video" />
              <CardContent className="p-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
