import { useState } from 'react';
import { stripMediaUrls } from '@/lib/postUtils';

interface NoteContentProps {
  content: string;
  maxLines?: number;
}

export function NoteContent({ content, maxLines }: NoteContentProps) {
  const [expanded, setExpanded] = useState(false);
  const text = stripMediaUrls(content);

  // Check if content needs truncation
  const shouldTruncate = maxLines != null && !expanded && text.length > 280;

  const renderedText = shouldTruncate ? text.slice(0, 280) + '…' : text;

  // Simple linkification
  const parts = renderedText.split(/(\s+)/);

  return (
    <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
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
          // Potential nostr mention
          return <span key={i} className="text-primary/80">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
      {shouldTruncate && (
        <button
          className="ml-1 text-primary text-xs font-semibold hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          Show more
        </button>
      )}
    </div>
  );
}
