import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { Play, Plus, Music, Video, CheckCircle, Rss } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { RepostBanner } from './RepostBanner';
import {
  getEventTitle,
  getCoverImage,
  relativeTime,
  getAudioTrackInfo,
  eventToNevent,
  extractVideos,
  extractAudio,
} from '@/lib/postUtils';
import { isRssSyntheticEvent } from '@/lib/rssAdapter';
import { useMixstr } from '@/hooks/useMixstr';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';
import { useResolvedEvent } from '@/hooks/useResolvedEvent';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AudioTrack } from '@/contexts/MixstrContext';

interface AudioCardProps {
  event: NostrEvent;
  /** Optional community moderation action. */
  moderation?: { onApprove: () => void };
}

export function AudioCard({ event, moderation }: AudioCardProps) {
  const navigate = useNavigate();

  // Resolve repost/community-approval wrappers to the original event.
  const { event: displayEvent, wrapper } = useResolvedEvent(event);

  const isRss = isRssSyntheticEvent(displayEvent);
  const author = useAuthor(isRss ? undefined : displayEvent.pubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(displayEvent.pubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const rssFeedTitle = displayEvent.tags.find(([k]) => k === 'feedTitle')?.[1];
  const displayName = isRss
    ? (rssFeedTitle ?? 'RSS Feed')
    : rawName.trim() || displayEvent.pubkey.slice(0, 10) + '…';
  const { playTrack, addToQueue } = useMixstr();

  const trackInfo = getAudioTrackInfo(displayEvent);
  const cover = getCoverImage(displayEvent);
  const title = getEventTitle(displayEvent) ?? (displayEvent.content.slice(0, 60).trim() || 'Untitled Track');
  const nevent = eventToNevent(displayEvent);
  const rssLink = isRss ? displayEvent.tags.find(([k]) => k === 'link')?.[1] : undefined;

  // Nothing playable
  if (!trackInfo) return null;

  const explicitArtwork = trackInfo.artwork ?? cover;
  const { dataUrl: videoFrame, loading: frameLoading } = useVideoThumbnail(
    !explicitArtwork && trackInfo.isVideo ? trackInfo.url : undefined,
  );
  const artwork = explicitArtwork || videoFrame;

  const track: AudioTrack = {
    event: displayEvent,
    title: trackInfo.title,
    url: trackInfo.url,
    artist: displayName,
    artwork,
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    playTrack(track);
  };

  const handleQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToQueue(track);
  };

  // Clicking the row opens the dedicated media player page with media URL and destination
  const handleRowClick = () => {
    const params = new URLSearchParams();
    
    // Prefer video URL if available, otherwise use audio URL
    const videos = extractVideos(displayEvent);
    const audios = extractAudio(displayEvent);
    const mediaUrl = videos.length > 0 ? videos[0] : audios[0];
    const isVideo = videos.length > 0;
    
    params.set('media', mediaUrl);
    params.set('title', track.title);
    params.set('type', isVideo ? 'video' : 'audio');
    if (rssLink) {
      params.set('dest', rssLink);
    }
    navigate(`/player?${params.toString()}`);
  };

  return (
    <div
      className="border-b border-border hover:bg-accent/30 transition-colors cursor-pointer group"
      onClick={handleRowClick}
    >
      {/* ── Repost / community approval banner ── */}
      {wrapper && (
        <RepostBanner wrapper={wrapper} className="px-4 pt-2 pb-0" />
      )}

      <div className="flex items-center gap-4 px-4 py-3">
        {/* Album art / video thumbnail with play overlay */}
        <div className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
        {artwork ? (
          <img
            src={artwork}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : frameLoading ? (
          <Skeleton className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {trackInfo.isVideo ? (
              <Video size={20} className="text-muted-foreground" />
            ) : (
              <Music size={20} className="text-muted-foreground" />
            )}
          </div>
        )}
        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handlePlay}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"
          >
            <Play size={14} className="text-primary-foreground ml-0.5" fill="currentColor" />
          </button>
        </div>
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{track.title}</p>
        {isRss ? (
          <span className="text-xs text-muted-foreground truncate block">{displayName}</span>
        ) : (
          <Link
            to={`/${npub}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block"
          >
            {displayName}
          </Link>
        )}
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-muted-foreground">{relativeTime(displayEvent.created_at)}</p>
          {trackInfo.isVideo && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">video</span>
          )}
        </div>
      </div>

      {/* Action buttons — stop propagation so they don't navigate */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {moderation && (
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); moderation.onApprove(); }}
            className="gap-1.5 h-7 text-xs bg-green-600 hover:bg-green-500 text-white mr-1"
          >
            <CheckCircle size={13} />
            Approve
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="w-9 h-9 rounded-full hover:bg-primary hover:text-primary-foreground transition-colors"
          onClick={handlePlay}
          title="Play now"
        >
          <Play size={16} fill="currentColor" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="w-9 h-9 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          onClick={handleQueue}
          title="Add to queue"
        >
          <Plus size={16} />
        </Button>
      </div>
      </div>
    </div>
  );
}
