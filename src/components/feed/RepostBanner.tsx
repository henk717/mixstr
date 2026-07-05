import type { NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { Repeat2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthor } from '@/hooks/useAuthor';
import { eventToNevent, isCommunityApproval } from '@/lib/postUtils';

interface RepostBannerProps {
  /** The wrapper event (kind 6 / 16 / 4550). */
  wrapper: NostrEvent;
  className?: string;
}

/**
 * Shared banner that displays who reposted / approved a post.
 * Used across all feed view cards (short, long, media, audio).
 */
export function RepostBanner({ wrapper, className }: RepostBannerProps) {
  const author = useAuthor(wrapper.pubkey);
  const meta = author.data?.metadata;
  const rawName = meta?.display_name || meta?.name || '';
  const name = rawName.trim() || wrapper.pubkey.slice(0, 10) + '…';
  const isApproval = isCommunityApproval(wrapper);

  return (
    <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      {isApproval ? <CheckCircle size={13} /> : <Repeat2 size={13} />}
      <Link
        to={`/${eventToNevent(wrapper)}`}
        onClick={(e) => e.stopPropagation()}
        className="hover:underline font-medium"
      >
        {name}
      </Link>
      <span>{isApproval ? 'approved this post' : 'reposted this post'}</span>
    </div>
  );
}
