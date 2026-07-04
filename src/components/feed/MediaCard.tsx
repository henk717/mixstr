import type { NostrEvent } from '@nostrify/nostrify';
import { Play, Image } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import {
  extractImages,
  extractVideos,
  getEventTitle,
  relativeTime,
} from '@/lib/postUtils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface MediaCardProps {
  event: NostrEvent;
  onClick?: () => void;
}

export function MediaCard({ event, onClick }: MediaCardProps) {
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(event.pubkey);
  const displayName = meta?.display_name ?? meta?.name ?? event.pubkey.slice(0, 10) + '…';

  const images = extractImages(event);
  const videos = extractVideos(event);
  const title = getEventTitle(event) ?? event.content.slice(0, 80).trim();
  const isVideo = videos.length > 0;
  const thumbnail = isVideo
    ? images[0] // poster frame
    : images[0];

  if (!thumbnail && !isVideo) return null;

  return (
    <div
      className="group cursor-pointer rounded-xl overflow-hidden bg-card border border-border hover:border-primary/50 transition-all duration-200 hover:shadow-lg hover:shadow-primary/10"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Image size={32} className="text-muted-foreground" />
          </div>
        )}

        {/* Play overlay for videos */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
              <Play size={20} className="text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}

        {/* Duration badge placeholder */}
        {isVideo && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
            video
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex gap-2">
        <Link
          to={`/${npub}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
            <AvatarImage src={meta?.picture} />
            <AvatarFallback className="text-xs bg-primary/20 text-primary font-bold">
              {displayName[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
            {title || 'Untitled'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground">{relativeTime(event.created_at)}</p>
        </div>
      </div>
    </div>
  );
}
