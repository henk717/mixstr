import { Rss } from 'lucide-react';
import { relativeTime } from '@/lib/postUtils';
import { getRssItemInfo } from '@/lib/rssAdapter';
import type { NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';

interface RssAuthorHeaderProps {
  event: NostrEvent;
  compact?: boolean;
  className?: string;
}

export function RssAuthorHeader({ event, compact, className }: RssAuthorHeaderProps) {
  const info = getRssItemInfo(event);
  if (!info) return null;

  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <Rss size={compact ? 13 : 15} className="text-orange-400 flex-shrink-0" />
      <span className="font-semibold text-sm truncate">{info.feedTitle}</span>
      <span className="text-muted-foreground text-xs flex-shrink-0">· {relativeTime(event.created_at)}</span>
    </div>
  );
}
