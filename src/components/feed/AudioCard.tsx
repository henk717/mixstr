import type { NostrEvent } from '@nostrify/nostrify';
import { Play, Plus, Music, Video } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import {
  extractAudio,
  extractVideos,
  extractImages,
  getEventTitle,
  getCoverImage,
  relativeTime,
  getAudioTrackInfo,
} from '@/lib/postUtils';
import { useMixstr } from '@/hooks/useMixstr';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { AudioTrack } from '@/contexts/MixstrContext';

interface AudioCardProps {
  event: NostrEvent;
  onClick?: () => void;
}

export function AudioCard({ event, onClick }: AudioCardProps) {
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(event.pubkey);
  const displayName = meta?.display_name ?? meta?.name ?? event.pubkey.slice(0, 10) + '…';
  const { playTrack, addToQueue } = useMixstr();

  const audioUrls = extractAudio(event);
  const videoUrls = extractVideos(event);
  const images = extractImages(event);
  const cover = getCoverImage(event);
  const title = getEventTitle(event) ?? event.content.slice(0, 60).trim() ?? 'Untitled Track';

  const isVideoAudio = audioUrls.length === 0 && videoUrls.length > 0;
  const mediaUrl = audioUrls[0] ?? videoUrls[0];
  const trackInfo = event.kind === 31337 ? getAudioTrackInfo(event) : null;

  if (!mediaUrl) return null;

  const track: AudioTrack = {
    event,
    title: trackInfo?.title ?? title,
    url: trackInfo?.url ?? mediaUrl,
    artist: trackInfo?.artist ?? displayName,
    artwork: trackInfo?.artwork ?? cover,
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    playTrack(track);
  };

  const handleQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToQueue(track);
  };

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      {/* Album art */}
      <div className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
        {cover ? (
          <img
            src={cover}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideoAudio ? (
              <Video size={20} className="text-muted-foreground" />
            ) : (
              <Music size={20} className="text-muted-foreground" />
            )}
          </div>
        )}
        {/* Hover play overlay on art */}
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
        <Link
          to={`/${npub}`}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block"
        >
          {displayName}
        </Link>
        <p className="text-xs text-muted-foreground">{relativeTime(event.created_at)}</p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
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
  );
}
