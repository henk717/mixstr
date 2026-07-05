import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { Play, Image, Plus, Wifi, CheckCircle, Rss } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import {
  extractImages,
  extractVideos,
  extractExternalEmbeds,
  getEventTitle,
  getLivestreamInfo,
  isLivestream,
  relativeTime,
  eventToNevent,
  getAudioTrackInfo,
  tryExtractEmbeddedEvent,
} from '@/lib/postUtils';
import { isRssSyntheticEvent } from '@/lib/rssAdapter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMixstr } from '@/hooks/useMixstr';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import type { AudioTrack } from '@/contexts/MixstrContext';

interface MediaCardProps {
  event: NostrEvent;
  /** Optional community moderation action. */
  moderation?: { onApprove: () => void };
}

export function MediaCard({ event, moderation }: MediaCardProps) {
  const navigate = useNavigate();

  // Reposts and community approvals wrap the real post as JSON in content.
  const displayEvent = tryExtractEmbeddedEvent(event) ?? event;

  const author = useAuthor(isRss ? undefined : displayEvent.pubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(displayEvent.pubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const rssFeedTitle = displayEvent.tags.find(([k]) => k === 'feedTitle')?.[1];
  const displayName = isRss
    ? (rssFeedTitle ?? 'RSS Feed')
    : rawName.trim() || displayEvent.pubkey.slice(0, 10) + '…';
  const { addToQueue } = useMixstr();

  const images = extractImages(displayEvent);
  const videos = extractVideos(displayEvent);
  const embeds = extractExternalEmbeds(displayEvent);
  const livestream = isLivestream(displayEvent) ? getLivestreamInfo(displayEvent) : null;
  const isVideo = videos.length > 0;
  const isEmbed = embeds.length > 0 && !isVideo;
  const embed = embeds[0];
  const title = getEventTitle(displayEvent) ?? displayEvent.content.slice(0, 80).trim();
  const isRss = isRssSyntheticEvent(displayEvent);
  const rssLink = isRss ? displayEvent.tags.find(([k]) => k === 'link')?.[1] : undefined;

  // Choose thumbnail: explicit first, then extract a frame from the video if available.
  const thumbnail = embed?.thumbnail ?? images[0];
  const firstVideo = videos[0];
  const { dataUrl: videoFrame, loading: frameLoading } = useVideoThumbnail(
    !thumbnail && firstVideo ? firstVideo : undefined,
  );
  const displayThumbnail = thumbnail || videoFrame;
  const nevent = eventToNevent(displayEvent);

  // Nothing displayable
  if (!thumbnail && !isVideo && !isEmbed && !livestream) return null;

  const handleCardClick = () => {
    if (rssLink) {
      window.open(rssLink, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(`/${nevent}`);
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
