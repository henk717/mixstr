import { useNavigate } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';
import { Wifi, Users, CheckCircle } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { RepostBanner } from './RepostBanner';
import {
  getLivestreamInfo,
  livestreamToNaddr,
  relativeTime,
  eventToNevent,
} from '@/lib/postUtils';
import { isRssSyntheticEvent } from '@/lib/rssAdapter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useResolvedEvent } from '@/hooks/useResolvedEvent';

interface LivestreamCardProps {
  event: NostrEvent;
  /** Optional community moderation action. */
  moderation?: { onApprove: () => void };
}

export function LivestreamCard({ event, moderation }: LivestreamCardProps) {
  const navigate = useNavigate();

  // Resolve repost/community-approval wrappers to the original event.
  const { event: displayEvent, wrapper } = useResolvedEvent(event);
  const isRss = isRssSyntheticEvent(displayEvent);

  const info = getLivestreamInfo(displayEvent);

  // Use the actual host pubkey (first p-tag with role=Host, fallback to event.pubkey)
  const hostPubkey = info?.hostPubkey ?? displayEvent.pubkey;
  const author = useAuthor(hostPubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(hostPubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || hostPubkey.slice(0, 10) + '…';

  if (!info) return null;

  // Addressable events must link via naddr, not nevent
  const naddr = livestreamToNaddr(displayEvent);
  const isLive = info.status === 'live';
  const isEnded = info.status === 'ended';

  const handleCardClick = () => {
    navigate(`/${naddr}`);
  };

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
        <div className="absolute top-2 left-2">
          {isLive && (
            <Badge className="bg-red-600 text-white border-0 gap-1 text-xs font-bold px-2">
              <Wifi size={10} className="animate-pulse" />
              LIVE
            </Badge>
          )}
          {isEnded && (
            <Badge variant="secondary" className="text-xs">Ended</Badge>
          )}
          {info.status === 'planned' && (
            <Badge className="bg-blue-600 text-white border-0 text-xs">Upcoming</Badge>
          )}
        </div>

        {/* Viewer count */}
        {isLive && info.viewers != null && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
            <Users size={10} />
            {info.viewers.toLocaleString()}
          </div>
        )}

        {/* Title + host overlay at bottom */}
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
            <span className="text-white/50 text-xs ml-auto">{relativeTime(displayEvent.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Moderation */}
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
