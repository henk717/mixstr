import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { Wifi, Users, ExternalLink } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { getLivestreamInfo, eventToNevent, relativeTime } from '@/lib/postUtils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface LivestreamCardProps {
  event: NostrEvent;
}

export function LivestreamCard({ event }: LivestreamCardProps) {
  const navigate = useNavigate();
  const info = getLivestreamInfo(event);
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(event.pubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || event.pubkey.slice(0, 10) + '…';

  if (!info) return null;

  const nevent = eventToNevent(event);
  const isLive = info.status === 'live';
  const isEnded = info.status === 'ended';

  return (
    <div
      className="relative mx-4 my-3 rounded-xl overflow-hidden border cursor-pointer group transition-all duration-200 hover:shadow-lg"
      style={{
        borderColor: isLive ? 'rgb(220 38 38 / 0.5)' : 'hsl(var(--border))',
        boxShadow: isLive ? '0 0 0 1px rgb(220 38 38 / 0.2)' : undefined,
      }}
      onClick={() => navigate(`/${nevent}`)}
    >
      {/* Thumbnail / background */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {info.thumbnail ? (
          <img
            src={info.thumbnail}
            alt={info.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-red-950 to-black flex items-center justify-center">
            <Wifi size={48} className={isLive ? 'text-red-500 animate-pulse' : 'text-muted-foreground'} />
          </div>
        )}

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Status badge */}
        <div className="absolute top-3 left-3">
          {isLive && (
            <Badge className="bg-red-600 text-white border-0 gap-1 text-xs font-bold px-2">
              <Wifi size={10} className="animate-pulse" />
              LIVE
            </Badge>
          )}
          {isEnded && (
            <Badge variant="secondary" className="text-xs">
              Ended
            </Badge>
          )}
          {info.status === 'planned' && (
            <Badge className="bg-blue-600 text-white border-0 text-xs">
              Upcoming
            </Badge>
          )}
        </div>

        {/* Viewer count */}
        {isLive && info.viewers != null && (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
            <Users size={10} />
            {info.viewers.toLocaleString()}
          </div>
        )}

        {/* Title + author overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-white font-bold text-sm line-clamp-2 leading-snug mb-1.5">
            {info.title}
          </p>
          <div className="flex items-center gap-2">
            <Link to={`/${npub}`} onClick={(e) => e.stopPropagation()}>
              <Avatar className="w-6 h-6 flex-shrink-0">
                <AvatarImage src={meta?.picture} />
                <AvatarFallback className="text-[10px] bg-primary/40 text-primary font-bold">
                  {displayName[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
            <Link
              to={`/${npub}`}
              onClick={(e) => e.stopPropagation()}
              className="text-white/80 text-xs hover:text-white truncate"
            >
              {displayName}
            </Link>
            <span className="text-white/50 text-xs ml-auto">{relativeTime(event.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
