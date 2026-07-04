import { MessageCircle, Repeat2, Heart, Zap, Share } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PostActionsProps {
  eventId: string;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  zapAmount?: number;
  compact?: boolean;
}

export function PostActions({
  eventId,
  replyCount = 0,
  repostCount = 0,
  likeCount = 0,
  zapAmount = 0,
  compact = false,
}: PostActionsProps) {
  const btnCls = cn(
    'flex items-center gap-1.5 text-muted-foreground transition-colors group',
    compact ? 'text-xs' : 'text-sm',
  );
  const iconSize = compact ? 14 : 16;

  return (
    <div className={cn('flex items-center gap-4', compact ? 'gap-3' : 'gap-6')}>
      <button
        className={cn(btnCls, 'hover:text-blue-400')}
        onClick={(e) => e.stopPropagation()}
        title="Reply"
      >
        <span className="p-1.5 rounded-full group-hover:bg-blue-400/10 transition-colors">
          <MessageCircle size={iconSize} />
        </span>
        {replyCount > 0 && <span>{replyCount}</span>}
      </button>

      <button
        className={cn(btnCls, 'hover:text-green-400')}
        onClick={(e) => e.stopPropagation()}
        title="Repost"
      >
        <span className="p-1.5 rounded-full group-hover:bg-green-400/10 transition-colors">
          <Repeat2 size={iconSize} />
        </span>
        {repostCount > 0 && <span>{repostCount}</span>}
      </button>

      <button
        className={cn(btnCls, 'hover:text-pink-400')}
        onClick={(e) => e.stopPropagation()}
        title="React"
      >
        <span className="p-1.5 rounded-full group-hover:bg-pink-400/10 transition-colors">
          <Heart size={iconSize} />
        </span>
        {likeCount > 0 && <span>{likeCount}</span>}
      </button>

      <button
        className={cn(btnCls, 'hover:text-yellow-400')}
        onClick={(e) => e.stopPropagation()}
        title="Zap"
      >
        <span className="p-1.5 rounded-full group-hover:bg-yellow-400/10 transition-colors">
          <Zap size={iconSize} />
        </span>
        {zapAmount > 0 && (
          <span>{zapAmount >= 1000 ? `${Math.floor(zapAmount / 1000)}k` : zapAmount}</span>
        )}
      </button>

      <button
        className={cn(btnCls, 'hover:text-primary ml-auto')}
        onClick={(e) => e.stopPropagation()}
        title="Share"
      >
        <span className="p-1.5 rounded-full group-hover:bg-primary/10 transition-colors">
          <Share size={iconSize} />
        </span>
      </button>
    </div>
  );
}
