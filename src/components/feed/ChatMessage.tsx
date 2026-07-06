import type { NostrEvent } from '@nostrify/nostrify';
import { NoteContent } from '@/components/NoteContent';
import { PostAuthor } from './PostAuthor';

interface ChatMessageProps {
  event: NostrEvent;
}

export function ChatMessage({ event }: ChatMessageProps) {
  return (
    <div className="py-1.5 px-1 hover:bg-accent/40 rounded-lg transition-colors">
      <PostAuthor pubkey={event.pubkey} createdAt={event.created_at} compact />
      <div className="pl-9">
        <NoteContent
          event={event}
          disableEmbeds
          disableMediaEmbeds
          className="text-sm break-words leading-snug"
        />
      </div>
    </div>
  );
}
