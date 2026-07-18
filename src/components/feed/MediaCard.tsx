import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { Play, Image, Plus, Wifi, Users, CheckCircle, Rss } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { RepostBanner } from './RepostBanner';
import {
  extractImages,
  extractVideos,
  extractAudio,
  extractExternalEmbeds,
  getEventTitle,
  isLivestream,
  getLivestreamInfo,
  relativeTime,
  eventToNevent,
  getAudioTrackInfo,
  livestreamToNaddr,
  getCoverImage,
} from '@/lib/postUtils';
import { isRssSyntheticEvent } from '@/lib/rssAdapter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMixstr } from '@/hooks/useMixstr';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import { useResolvedEvent } from '@/hooks/useResolvedEvent';
import type { AudioTrack } from '@/contexts/MixstrContext';

interface MediaCardProps {
  event: NostrEvent;
  /** Optional community moderation action. */
  moderation?: { onApprove: () => void };
}

export function MediaCard({ event, moderation }: MediaCardProps) {
  const navigate = useNavigate();

  // Resolve repost/community-approval wrappers to the original event.
  const { event: displayEvent, wrapper } = useResolvedEvent(event);
  const isRss = isRssSyntheticEvent(displayEvent);
  const rssLink = isRss ? displayEvent.tags.find(([k]) => k === 'link')?.[1] : undefined;
  const rssFeedTitle = isRss ? displayEvent.tags.find(([k]) => k === 'feedTitle')?.[1] : undefined;

  const { addToQueue } = useMixstr();

   const images = extractImages(displayEvent);
   const videos = extractVideos(displayEvent);
   const audios = extractAudio(displayEvent);
   const embeds = extractExternalEmbeds(displayEvent);
   const livestream = isLivestream(displayEvent) ? getLivestreamInfo(displayEvent) : null;
   const isVideo = videos.length > 0;
   const isEmbed = embeds.length > 0 && !isVideo;
   const embed = embeds[0];

  // For livestreams, use the host pubkey (actual streamer) instead of event author
  const hostPubkey = livestream?.hostPubkey ?? displayEvent.pubkey;
  const author = useAuthor(isRss ? undefined : hostPubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(hostPubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = isRss
    ? (rssFeedTitle ?? 'RSS Feed')
    : rawName.trim() || hostPubkey.slice(0, 10) + '…';
  
  // For livestreams, use the livestream title and thumbnail
  const title = livestream?.title ?? (getEventTitle(displayEvent) ?? displayEvent.content.slice(0, 80).trim());
  const livestreamThumbnail = livestream?.thumbnail ?? getCoverImage(displayEvent);
  
  // Choose thumbnail: livestream first, then embed, then images, then video frame
  const thumbnail = livestreamThumbnail ?? embed?.thumbnail ?? images[0];
  const firstVideo = videos[0];
  const { dataUrl: videoFrame, loading: frameLoading } = useVideoThumbnail(
    !thumbnail && firstVideo ? firstVideo : undefined,
  );
  const displayThumbnail = thumbnail || videoFrame;
  const nevent = eventToNevent(displayEvent);
  const naddr = livestream ? livestreamToNaddr(displayEvent) : '';

  // Nothing displayable
  if (!thumbnail && !isVideo && !isEmbed && !livestream) return null;

   const handleCardClick = () => {
     // For RSS events with video/audio, navigate to the new player
     if (isRss && (videos.length > 0 || audios.length > 0)) {
       const params = new URLSearchParams();
       const mediaUrl = videos.length > 0 ? videos[0] : audios[0];
       const isVideo = videos.length > 0;
       params.set('media', mediaUrl);
       params.set('title', title);
       params.set('type', isVideo ? 'video' : 'audio');
       if (rssLink) {
         params.set('dest', rssLink);
       }
       navigate(`/player?${params.toString()}`);
       return;
     }
     
     // For RSS events without media (images only), open the external link
     if (rssLink) {
       window.open(rssLink, '_blank', 'noopener,noreferrer');
       return;
     }
     
     // Use naddr for livestreams, nevent for everything else
     navigate(`/${livestream ? naddr : nevent}`);
   };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    const trackInfo = getAudioTrackInfo(event);
    if (!trackInfo) return;
    const track: AudioTrack = {
      event: displayEvent,
      title: trackInfo.title,
      url: trackInfo.url,
      artist: displayName,
      artwork: displayThumbnail,
    };
    addToQueue(track);
  };

  const hasQueueable = videos.length > 0;

  return (
    <div
      className="group cursor-pointer rounded-xl overflow-hidden bg-card border border-border hover:border-primary/50 transition-all duration-200 hover:shadow-lg hover:shadow-primary/10"
      onClick={handleCardClick}
    >
      {/* ── Repost / community approval banner ── */}
      {wrapper && (
        <RepostBanner wrapper={wrapper} className="px-3 pt-2 pb-0" />
      )}

      {/* Thumbnail area */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {displayThumbnail ? (
          <img
            src={displayThumbnail}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : frameLoading ? (
          <Skeleton className="absolute inset-0 w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Image size={32} className="text-muted-foreground" />
          </div>
        )}

        {/* Play overlay */}
        {(isVideo || isEmbed) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/35 transition-colors">
            <div className="w-12 h-12 rounded-full bg-black/70 flex items-center justify-center">
              <Play size={20} className="text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}

        {/* Live badge */}
        {livestream?.status === 'live' && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            <Wifi size={10} className="animate-pulse" />
            LIVE
          </div>
        )}

        {/* Source badge */}
        {isEmbed && embed && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded capitalize">
            {embed.type}
          </div>
        )}
        {isVideo && !isEmbed && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
            video
          </div>
        )}

        {/* Add to queue button for videos */}
        {hasQueueable && (
          <button
            onClick={handleAddToQueue}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary"
            title="Add to audio queue"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Info row */}
      <div className="p-3 flex gap-2">
        {isRss ? (
          <a
            href={rssLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="w-8 h-8 flex-shrink-0 mt-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"
            title="Open original article"
          >
            <Rss size={14} className="text-orange-500" />
          </a>
        ) : (
          <Link to={`/${npub}`} onClick={(e) => e.stopPropagation()}>
            <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
              <AvatarImage src={meta?.picture} />
              <AvatarFallback className="text-xs bg-primary/20 text-primary font-bold">
                {displayName[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
            {title || 'Untitled'}
          </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{displayName}</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{relativeTime(displayEvent.created_at)}</p>
            {livestream?.viewers != null && (
              <p className="text-xs text-red-400">{livestream.viewers} watching</p>
            )}
          </div>
        </div>
      </div>

      {moderation && (
        <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            onClick={moderation.onApprove}
            className="gap-1.5 h-7 text-xs bg-green-600 hover:bg-green-500 text-white w-full"
          >
            <CheckCircle size={13} />
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}
