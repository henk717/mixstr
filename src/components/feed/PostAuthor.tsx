import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { relativeTime } from '@/lib/postUtils';
import { nip19 } from 'nostr-tools';
import { EmojifiedText } from '@/components/CustomEmoji';

interface PostAuthorProps {
  pubkey: string;
  createdAt: number;
  compact?: boolean;
}

export function PostAuthor({ pubkey, createdAt, compact }: PostAuthorProps) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  const authorEvent = author.data?.event;
  const npub = nip19.npubEncode(pubkey);
  const rawName = meta?.display_name || meta?.name || '';
  const displayName = rawName.trim() || pubkey.slice(0, 10) + '…';
  const avatarInitial = displayName[0]?.toUpperCase() || pubkey.slice(0, 1).toUpperCase();

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Link to={`/${npub}`} onClick={(e) => e.stopPropagation()}>
          <Avatar className="w-7 h-7 flex-shrink-0">
            <AvatarImage src={meta?.picture} />
            <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold">
              {avatarInitial}
            </AvatarFallback>
          </Avatar>
        </Link>
        <Link
          to={`/${npub}`}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-sm truncate hover:text-primary transition-colors"
        >
          {authorEvent ? (
            <EmojifiedText tags={authorEvent.tags}>{displayName}</EmojifiedText>
          ) : displayName}
        </Link>
        <span className="text-muted-foreground text-xs flex-shrink-0">
          · {relativeTime(createdAt)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link to={`/${npub}`} onClick={(e) => e.stopPropagation()}>
        <Avatar className="w-10 h-10 flex-shrink-0">
          <AvatarImage src={meta?.picture} />
          <AvatarFallback className="text-sm bg-primary/20 text-primary font-bold">
            {avatarInitial}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="min-w-0">
        <Link
          to={`/${npub}`}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-sm hover:text-primary transition-colors block truncate"
        >
          {authorEvent ? (
            <EmojifiedText tags={authorEvent.tags}>{displayName}</EmojifiedText>
          ) : displayName}
        </Link>
        {meta?.nip05 && (
          <p className="text-xs text-muted-foreground truncate">{meta.nip05}</p>
        )}
      </div>
      <span className="text-muted-foreground text-xs flex-shrink-0 ml-auto">
        {relativeTime(createdAt)}
      </span>
    </div>
  );
}
