import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { useMixstr } from '@/hooks/useMixstr';

export function HashtagFeedPage() {
  const { tag } = useParams<{ tag: string }>();
  const { nostr } = useNostr();
  const { feedViewModes, setFeedViewMode } = useMixstr();
  const feedKey = `hashtag:${tag}`;
  const mode = feedViewModes[feedKey] ?? 'short';

  useSeoMeta({ title: `#${tag} · Mixstr` });

  const { data: events = [], isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'hashtag', tag],
    queryFn: async ({ signal }) => {
      if (!tag) return [];
      return nostr.query(
        [{ kinds: [1, 30023], '#t': [tag], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
    },
    enabled: !!tag,
    staleTime: 60 * 1000,
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-2">
          <Hash size={20} className="text-primary" />
          <h1 className="text-lg font-bold">#{tag}</h1>
        </div>
        <div className="px-4 pb-3">
          <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
        </div>
      </div>
      <FeedView events={events} mode={mode} isLoading={isLoading} />
    </div>
  );
}
