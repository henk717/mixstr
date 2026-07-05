import { useState, useCallback, useRef } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { Input } from '@/components/ui/input';
import { useExploreSearch } from '@/hooks/useExploreSearch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { ShortPostCard } from '@/components/feed/ShortPostCard';
import { InfiniteScrollSentinel } from '@/components/feed/InfiniteScrollSentinel';
import type { NostrEvent } from '@nostrify/nostrify';

function PeopleResult({ event }: { event: NostrEvent }) {
  let meta: { name?: string; display_name?: string; picture?: string; about?: string; nip05?: string } = {};
  try {
    meta = JSON.parse(event.content);
  } catch {/* ignore */}

  const displayName = meta.display_name || meta.name || event.pubkey.slice(0, 10) + '…';
  const npub = nip19.npubEncode(event.pubkey);

  return (
    <Link
      to={`/${npub}`}
      className="flex-shrink-0 flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-accent/30 transition-all duration-150 w-28 text-center"
    >
      <Avatar className="w-12 h-12">
        <AvatarImage src={meta.picture} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
          {displayName[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 w-full">
        <p className="text-xs font-semibold truncate text-foreground">{displayName}</p>
        {meta.nip05 && (
          <p className="text-[10px] text-muted-foreground truncate">{meta.nip05}</p>
        )}
      </div>
    </Link>
  );
}

export function ExplorePage() {
  useSeoMeta({ title: 'Explore · Mixstr' });
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 250);
  const { people, posts, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useExploreSearch(debouncedQuery);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  }, []);

  const hasQuery = debouncedQuery.trim().length > 0;
  const hasPeople = people.length > 0;
  const hasPosts = posts.length > 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <Search size={20} className="text-primary" />
          <h1 className="text-lg font-bold">Explore</h1>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search people and posts…"
              className="pl-9 bg-muted border-transparent focus:border-primary"
              value={query}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* Empty state — no query yet */}
      {!hasQuery && (
        <Card className="border-dashed mx-4 my-8">
          <CardContent className="py-12 px-8 text-center">
            <Search size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Type a name, keyword, or NIP-05 address to find people and posts on Nostr.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {hasQuery && isLoading && (
        <div className="px-4 py-4 space-y-6">
          {/* People skeleton */}
          <div>
            <Skeleton className="h-4 w-20 mb-3" />
            <div className="flex gap-3 overflow-x-auto pb-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 flex flex-col items-center gap-2 p-3 rounded-xl border border-border w-28">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
          {/* Posts skeleton */}
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-4 border-b border-border">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {hasQuery && !isLoading && (
        <div>
          {/* People section — horizontal scroll */}
          {hasPeople && (
            <div className="px-4 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                People
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {people.map((event) => (
                  <PeopleResult key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}

          {/* Posts section */}
          {hasPosts && (
            <div>
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Posts
                </h2>
              </div>
              {posts.map((event) => (
                <ShortPostCard key={event.id} event={event} />
              ))}
              <InfiniteScrollSentinel
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={fetchNextPage}
              />
            </div>
          )}

          {/* No results */}
          {!hasPeople && !hasPosts && (
            <Card className="border-dashed mx-4 my-8">
              <CardContent className="py-12 px-8 text-center">
                <Search size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  No results found for "<span className="font-medium text-foreground">{debouncedQuery}</span>".
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Try a different name or keyword.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
