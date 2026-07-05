import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Zap, RefreshCw } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { useMixstr } from '@/hooks/useMixstr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const DVM_CONFIGS: Record<string, { label: string; description: string }> = {
  trending: {
    label: 'Trending Feed',
    description: 'Trending notes from the Nostr network via DVM',
  },
  news: {
    label: 'Nostr News',
    description: 'News and updates from the Nostr ecosystem',
  },
};

export function DvmFeedPage() {
  const { id } = useParams<{ id: string }>();
  const config = DVM_CONFIGS[id ?? ''];
  const { nostr } = useNostr();
  const { feedViewModes, setFeedViewMode } = useMixstr();
  const feedKey = `dvm:${id}`;
  const mode = feedViewModes[feedKey] ?? 'short';
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useSeoMeta({ title: `${config?.label ?? 'DVM Feed'} · Mixstr` });

  // For now, fetch recent popular notes as a placeholder for DVM output
  const { data: events = [], isLoading, refetch } = useQuery<NostrEvent[]>({
    queryKey: ['nostr', 'dvm-placeholder', id],
    queryFn: async ({ signal }) => {
      return nostr.query(
        [{ kinds: [1], limit: 30 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
    },
    staleTime: 2 * 60 * 1000,
  });

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['nostr', 'dvm-placeholder', id] });
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  const spinning = isRefreshing || isLoading;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-2">
          <Zap size={20} className="text-primary" />
          <div className="flex-1">
            <h1 className="text-lg font-bold">{config?.label ?? id}</h1>
            {config?.description && (
              <p className="text-xs text-muted-foreground">{config.description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-muted-foreground hover:text-primary flex-shrink-0"
            onClick={() => void handleRefresh()}
            disabled={spinning}
            title="Refresh"
          >
            <RefreshCw size={15} className={spinning ? 'animate-spin' : ''} />
          </Button>
        </div>
        <div className="px-4 pb-3">
          <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
        </div>
      </div>

      <Card className="mx-4 my-4 border-primary/30 bg-primary/5">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Zap size={12} className="text-primary" />
            DVM integration coming soon — showing recent global notes as preview
          </p>
        </CardContent>
      </Card>

      <FeedView events={events} mode={mode} isLoading={isLoading} />
    </div>
  );
}
