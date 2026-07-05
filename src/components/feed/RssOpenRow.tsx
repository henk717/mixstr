import { useState } from 'react';
import { ExternalLink, Share2, Check } from 'lucide-react';
import { getRssItemInfo } from '@/lib/rssAdapter';
import { useToast } from '@/hooks/useToast';
import type { NostrEvent } from '@nostrify/nostrify';
import { cn } from '@/lib/utils';

interface RssOpenRowProps {
  event: NostrEvent;
  compact?: boolean;
  className?: string;
}

export function RssOpenRow({ event, compact, className }: RssOpenRowProps) {
  const info = getRssItemInfo(event);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!info?.link) return null;

  const iconSize = compact ? 14 : 16;

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(info.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Link copied!' });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  }

  return (
    <div className={cn('flex items-center gap-3', className)} onClick={(e) => e.stopPropagation()}>
      <a
        href={info.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink size={iconSize} />
        Open article
      </a>
      <button
        type="button"
        onClick={handleShare}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Copy link"
        aria-label="Copy link"
      >
        {copied ? <Check size={iconSize} className="text-green-400" /> : <Share2 size={iconSize} />}
        {copied ? 'Copied' : 'Share'}
      </button>
    </div>
  );
}
