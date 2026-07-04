import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { RefreshCw, Pencil, CloudOff } from 'lucide-react';
import { useMixstr } from '@/hooks/useMixstr';
import { useListFeed } from '@/hooks/useListFeed';
import { FeedView } from '@/components/feed/FeedView';
import { ViewModeSwitcher } from '@/components/feed/ViewModeSwitcher';
import { ListIcon } from '@/components/layout/ListIcon';
import { EditListDialog } from '@/components/layout/EditListDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sourceDescription } from '@/lib/sidebarLists';
import { useState } from 'react';

export function ListFeedPage() {
  const { id } = useParams<{ id: string }>();
  const { sidebarLists, updateSidebarList, feedViewModes, setFeedViewMode } = useMixstr();
  const [editOpen, setEditOpen] = useState(false);

  const list = sidebarLists.find((l) => l.id === id);
  const feedKey = `list:${id}`;
  const mode = feedViewModes[feedKey] ?? 'short';

  useSeoMeta({ title: `${list?.label ?? 'Feed'} · Mixstr` });

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useListFeed(list ?? { id: '', label: '', icon: 'hash', sources: [], createdAt: 0 });

  const pages = useMemo(() => data?.pages ?? [], [data]);

  if (!list) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">List not found.</p>
        <Link to="/" className="text-primary text-sm mt-2 block hover:underline">
          Go home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <ListIcon icon={list.icon} size={20} className="text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-foreground truncate">{list.label}</h1>
            {list.sources.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {list.sources.map((src) => (
                  <Badge
                    key={src.id}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground"
                  >
                    {src.label ?? sourceDescription(src)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-primary"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-primary"
              onClick={() => setEditOpen(true)}
              title="Edit list"
            >
              <Pencil size={15} />
            </Button>
          </div>
        </div>
        <div className="px-4 pb-3">
          <ViewModeSwitcher mode={mode} onChange={(m) => setFeedViewMode(feedKey, m)} />
        </div>
      </div>

      <FeedView
        pages={pages}
        mode={mode}
        isLoading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />

      <EditListDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={list}
        onSave={(updated) => updateSidebarList(list.id, updated)}
      />
    </div>
  );
}
