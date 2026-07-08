import { useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';
import type { AddrCoords } from '@/components/NoteContent';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAuthor } from '@/hooks/useAuthor';
import { Wifi, Play } from 'lucide-react';
import {
  getLivestreamInfo,
  getEventTitle,
  getCoverImage,
  isLivestream,
  livestreamToNaddr,
} from '@/lib/postUtils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

interface EmbeddedNaddrProps {
  addr: AddrCoords;
  className?: string;
}

/**
 * Fetches an addressable event by its coordinates (kind, pubkey, identifier).
 */
function useAddrEvent(addr: AddrCoords) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['addr-event', addr.kind, addr.pubkey, addr.identifier],
    queryFn: async () => {
      const filters = [
        {
          kinds: [addr.kind],
          authors: [addr.pubkey],
          '#d': [addr.identifier],
          limit: 1,
        },
      ];

      // If relay hints are provided, try those first
      if (addr.relays && addr.relays.length > 0) {
        try {
          const results = await nostr.req(filters, addr.relays);
          if (results && results.length > 0) {
            return results[0];
          }
        } catch {
          // Fall through to default relay pool
        }
      }

      // Fallback to default relay pool
      const results = await nostr.query(filters);
      return results?.[0] || null;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Rich embedded-naddr card — fetches and renders the referenced
 * addressable event with appropriate preview based on kind.
 *
 * Supports:
 * - Kind 30311 (NIP-53 livestreams) — shows title, thumbnail, status, viewer count
 * - Kind 30023 (NIP-29 articles) — shows title, cover image, summary
 * - Other addressable events — shows generic card with kind info
 */
export function EmbeddedNaddr({ addr, className }: EmbeddedNaddrProps) {
  const navigate = useNavigate();
  const query = useAddrEvent(addr);
  const event = query.data;

  const naddrId = nip19.naddrEncode({
    kind: addr.kind,
    pubkey: addr.pubkey,
    identifier: addr.identifier,
    ...(addr.relays?.length ? { relays: addr.relays } : {}),
  });

  // Loading state
  if (query.isLoading) {
    return (
      <div
        className={cn(
          'block border rounded-lg p-3 animate-pulse',
          className,
        )}
      >
        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    );
  }

  // Error or no event found — show fallback
  if (!event) {
    return (
      <Link
        to={`/${naddrId}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'block border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors text-sm',
          className,
        )}
      >
        <div className="font-medium">Addressable event</div>
        <div className="text-xs text-muted-foreground font-mono truncate">
          kind:{addr.kind} · {addr.identifier || '(no identifier)'}
        </div>
      </Link>
    );
  }

  // Render based on event kind
  if (isLivestream(event)) {
    return <LivestreamPreview event={event} className={className} />;
  }

  // Generic addressable event preview (e.g., articles)
  return <GenericAddrPreview event={event} naddrId={naddrId} className={className} />;
}

/** Livestream preview card for kind 30311 */
function LivestreamPreview({ event, className }: { event: NostrEvent; className?: string }) {
  const navigate = useNavigate();
  const info = getLivestreamInfo(event);
  const naddr = livestreamToNaddr(event);

  // Use the actual host pubkey (first p-tag with role=Host, fallback to event.pubkey)
  const hostPubkey = info?.hostPubkey ?? event.pubkey;
  const author = useAuthor(hostPubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(hostPubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || hostPubkey.slice(0, 10) + '…';

  if (!info) return null;

  const isLive = info.status === 'live';
  const isEnded = info.status === 'ended';
  const thumbnail = info.thumbnail;

  return (
    <div
      className={cn(
        'relative group cursor-pointer rounded-lg overflow-hidden border transition-all duration-200 hover:shadow-md',
        isLive ? 'border-red-500/50' : 'border-border',
        className,
      )}
      onClick={() => navigate(`/${naddr}`)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={info.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-red-950 to-black flex items-center justify-center">
            <Wifi size={32} className={isLive ? 'text-red-500 animate-pulse' : 'text-muted-foreground'} />
          </div>
        )}

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Status badge */}
        <div className="absolute top-2 left-2">
          {isLive && (
            <Badge className="bg-red-600 text-white border-0 gap-1 text-[10px] font-bold px-1.5">
              <Wifi size={8} className="animate-pulse" />
              LIVE
            </Badge>
          )}
          {isEnded && <Badge variant="secondary" className="text-[10px]">Ended</Badge>}
          {info.status === 'planned' && (
            <Badge className="bg-blue-600 text-white border-0 text-[10px]">Upcoming</Badge>
          )}
        </div>

        {/* Viewer count */}
        {isLive && info.viewers != null && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-full">
            <Wifi size={8} />
            {info.viewers.toLocaleString()}
          </div>
        )}

        {/* Play icon */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-10 h-10 rounded-full bg-black/70 flex items-center justify-center">
            <Play size={16} className="text-white ml-0.5" fill="white" />
          </div>
        </div>

        {/* Title + host overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="text-white text-xs font-semibold line-clamp-2 leading-snug mb-1">
            {info.title}
          </p>
          <div className="flex items-center gap-1.5">
            <Link to={`/${npub}`} onClick={(e) => e.stopPropagation()}>
              <Avatar className="w-5 h-5 flex-shrink-0">
                <AvatarImage src={meta?.picture} />
                <AvatarFallback className="text-[8px] bg-primary/40 text-primary font-bold">
                  {displayName[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
            <Link
              to={`/${npub}`}
              onClick={(e) => e.stopPropagation()}
              className="text-white/80 text-[10px] hover:text-white truncate"
            >
              {displayName}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Generic addressable event preview (e.g., articles, marketplace items) */
function GenericAddrPreview({
  event,
  naddrId,
  className,
}: {
  event: NostrEvent;
  naddrId: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const meta = author.data?.metadata;
  const npub = nip19.npubEncode(event.pubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || event.pubkey.slice(0, 10) + '…';
  const title = getEventTitle(event) || event.content.slice(0, 80).trim();
  const coverImage = getCoverImage(event);

  return (
    <Link
      to={`/${naddrId}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block border rounded-lg overflow-hidden hover:bg-muted/50 transition-colors',
        className,
      )}
    >
      {/* Cover image if available */}
      {coverImage && (
        <div className="relative aspect-video bg-muted overflow-hidden">
          <img
            src={coverImage}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content */}
      <div className="p-3">
        <div className="text-sm font-semibold line-clamp-2 mb-1">{title || 'Untitled'}</div>
        <div className="flex items-center gap-2">
          <Avatar className="w-5 h-5 flex-shrink-0">
            <AvatarImage src={meta?.picture} />
            <AvatarFallback className="text-[8px] bg-primary/20 text-primary font-bold">
              {displayName[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground truncate">{displayName}</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            kind:{event.kind}
          </span>
        </div>
      </div>
    </Link>
  );
}
