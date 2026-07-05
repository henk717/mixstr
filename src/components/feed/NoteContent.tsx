import { stripMediaUrls } from '@/lib/postUtils';
import { cn } from '@/lib/utils';

interface NoteContentProps {
  content: string;
  /** If set, clamp the text to this many lines. Pass undefined for full height. */
  maxLines?: number;
}

export function NoteContent({ content, maxLines }: NoteContentProps) {
  const text = stripMediaUrls(content);

  // Map maxLines → Tailwind line-clamp class
  const clampClass: string | undefined = maxLines != null
    ? maxLines <= 1 ? 'line-clamp-1'
    : maxLines === 2 ? 'line-clamp-2'
    : maxLines === 3 ? 'line-clamp-3'
    : maxLines === 4 ? 'line-clamp-4'
    : maxLines === 5 ? 'line-clamp-5'
    : 'line-clamp-6'
    : undefined;

  // Simple linkification — split on whitespace tokens
  const parts = text.split(/(\s+)/);

  return (
    <div
      className={cn(
        'text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words',
        clampClass,
      )}
    >
      {parts.map((part, i) => {
        if (part.match(/^https?:\/\/\S+$/)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        if (part.match(/^#\w+$/)) {
          return (
            <a
              key={i}
              href={`/t/${part.slice(1)}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        if (part.match(/^@?\w{10,}$/)) {
          return <span key={i} className="text-primary/80">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}
