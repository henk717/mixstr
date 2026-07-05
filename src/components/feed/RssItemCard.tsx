import { ExternalLink, Rss } from 'lucide-react';
import { relativeTime } from '@/lib/postUtils';
import type { RssItem } from '@/hooks/useRssFeed';

interface RssItemCardProps {
  item: RssItem;
}

export function RssItemCard({ item }: RssItemCardProps) {
  return (
    <article className="px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors">
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Feed source label */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Rss size={11} className="text-orange-400 flex-shrink-0" />
          <span className="truncate">{item.feedTitle}</span>
          <span className="ml-auto flex-shrink-0">{relativeTime(item.pubDate)}</span>
        </div>

        <div className="flex gap-3">
          {/* Thumbnail */}
          {item.image && (
            <div className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-muted border border-border">
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          {/* Text */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {item.description}
              </p>
            )}
            <div className="flex items-center gap-1 mt-1.5 text-xs text-primary/70 group-hover:text-primary transition-colors">
              <ExternalLink size={10} />
              <span>Read article</span>
            </div>
          </div>
        </div>
      </a>
    </article>
  );
}
