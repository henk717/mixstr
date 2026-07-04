import { useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { User, Shield, X, Plus, Search, Check, RefreshCw, ExternalLink } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowing } from '@/hooks/useFollowing';
import { useNostr } from '@nostrify/react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EditProfileForm } from '@/components/EditProfileForm';
import { LoginArea } from '@/components/auth/LoginArea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toHexPubkey(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
  try {
    const decoded = nip19.decode(v);
    if (decoded.type === 'npub') return decoded.data as string;
    if (decoded.type === 'nprofile') return (decoded.data as { pubkey: string }).pubkey;
  } catch {}
  return undefined;
}

// ---------------------------------------------------------------------------
// People picker with follow-list autocomplete
// ---------------------------------------------------------------------------

function PeoplePicker({
  pubkeys,
  onChange,
  placeholder = 'Search follows or paste npub…',
}: {
  pubkeys: string[];
  onChange: (pks: string[]) => void;
  placeholder?: string;
}) {
  const { nostr } = useNostr();
  const { data: followingHex = [] } = useFollowing();
  const [search, setSearch] = useState('');
  const [manualInput, setManualInput] = useState('');

  const { data: metaMap = {} } = useQuery<Record<string, NostrMetadata>>({
    queryKey: ['nostr', 'follow-meta-batch', followingHex.slice(0, 150).join(',')],
    queryFn: async ({ signal }) => {
      if (!followingHex.length) return {};
      const events = await nostr.query(
        [{ kinds: [0], authors: followingHex.slice(0, 150), limit: 150 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      const map: Record<string, NostrMetadata> = {};
      for (const ev of events) {
        try { map[ev.pubkey] = JSON.parse(ev.content) as NostrMetadata; } catch {}
      }
      return map;
    },
    enabled: followingHex.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = useMemo(() => {
    const q = search.toLowerCase();
    return followingHex
      .map((pk) => {
        const meta = metaMap[pk];
        const name = meta?.display_name || meta?.name || '';
        return { pk, name };
      })
      .filter(({ pk, name }) => q ? name.toLowerCase().includes(q) || pk.includes(q) : true)
      .slice(0, 20);
  }, [followingHex, metaMap, search]);

  const toggle = (pk: string) => {
    if (pubkeys.includes(pk)) onChange(pubkeys.filter((p) => p !== pk));
    else onChange([...pubkeys, pk]);
  };

  const addManual = () => {
    const hex = toHexPubkey(manualInput);
    if (hex && !pubkeys.includes(hex)) onChange([...pubkeys, hex]);
    setManualInput('');
  };

  return (
    <div className="space-y-3">
      {/* Chips */}
      {pubkeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pubkeys.map((pk) => {
            const meta = metaMap[pk];
            const name = meta?.display_name || meta?.name || pk.slice(0, 8) + '…';
            return (
              <Badge key={pk} variant="secondary" className="gap-1 pr-1">
                {name}
                <button
                  onClick={() => onChange(pubkeys.filter((p) => p !== pk))}
                  className="text-muted-foreground hover:text-destructive ml-0.5"
                >
                  <X size={10} />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Search */}
      {followingHex.length > 0 && (
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your follows…"
            className="pl-8 h-8 text-sm"
          />
        </div>
      )}

      {search !== '' && suggestions.length > 0 && (
        <div className="max-h-40 overflow-y-auto border border-border rounded-lg bg-background text-sm divide-y divide-border">
          {suggestions.map(({ pk, name }) => {
            const selected = pubkeys.includes(pk);
            return (
              <button
                key={pk}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-2 hover:bg-accent transition-colors text-left',
                  selected && 'text-primary',
                )}
                onClick={() => toggle(pk)}
              >
                <span className="truncate">{name || pk.slice(0, 12) + '…'}</span>
                {selected && <Check size={12} className="flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Manual entry */}
      <div className="flex gap-2">
        <Input
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addManual()}
          placeholder={placeholder}
          className="h-8 text-sm flex-1"
        />
        <Button size="sm" variant="outline" onClick={addManual} className="h-8">
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block Settings — NIP-51 kind 10000 mute list
// ---------------------------------------------------------------------------

interface MuteList {
  pubkeys: string[];    // p tags — muted people
  keywords: string[];  // word tags — muted keywords (Amethyst compatible)
  lists: string[];     // a tags — external lists acting as blocklists (naddr)
}

function parseMuteEvent(event: NostrEvent | undefined): MuteList {
  if (!event) return { pubkeys: [], keywords: [], lists: [] };
  return {
    pubkeys: event.tags.filter(([t]) => t === 'p').map(([, v]) => v).filter(Boolean),
    keywords: event.tags.filter(([t]) => t === 'word').map(([, v]) => v).filter(Boolean),
    lists: event.tags.filter(([t]) => t === 'a').map(([, v]) => v).filter(Boolean),
  };
}

function BlockSettings() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: muteEvent, isLoading } = useQuery<NostrEvent | null>({
    queryKey: ['nostr', 'mute-list', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return null;
      const [ev] = await nostr.query(
        [{ kinds: [10000], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return ev ?? null;
    },
    enabled: !!user?.pubkey,
    staleTime: 2 * 60 * 1000,
  });

  const remote = useMemo(() => parseMuteEvent(muteEvent ?? undefined), [muteEvent]);

  const [pubkeys, setPubkeys] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [lists, setLists] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [listInput, setListInput] = useState('');

  // Sync remote → local once loaded
  const [synced, setSynced] = useState(false);
  if (!synced && !isLoading && (muteEvent !== undefined)) {
    setPubkeys(remote.pubkeys);
    setKeywords(remote.keywords);
    setLists(remote.lists);
    setSynced(true);
  }

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) setKeywords((prev) => [...prev, kw]);
    setKeywordInput('');
  };

  const addList = () => {
    const v = listInput.trim();
    if (!v) return;
    // Accept naddr1 or raw "30000:pubkey:d-tag" / "3:pubkey:d-tag" format
    let addr = v;
    if (v.startsWith('naddr')) {
      try {
        const dec = nip19.decode(v);
        if (dec.type === 'naddr') {
          const { kind, pubkey, identifier } = dec.data;
          addr = `${kind}:${pubkey}:${identifier}`;
        }
      } catch {}
    }
    if (!lists.includes(addr)) setLists((prev) => [...prev, addr]);
    setListInput('');
  };

  const handleSave = async () => {
    if (!user) return;
    const tags: string[][] = [
      ...pubkeys.map((pk) => ['p', pk]),
      ...keywords.map((kw) => ['word', kw]),
      ...lists.map((l) => ['a', l]),
    ];
    try {
      await publish({ kind: 10000, content: '', tags });
      queryClient.invalidateQueries({ queryKey: ['nostr', 'mute-list', user.pubkey] });
      toast({ title: 'Block list saved', description: 'Your mute/block settings have been published to Nostr.' });
    } catch {
      toast({ title: 'Failed to save', description: 'Could not publish block list. Try again.', variant: 'destructive' });
    }
  };

  if (!user) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground text-sm mb-4">Sign in to manage your block list.</p>
          <LoginArea className="max-w-xs mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocked People</CardTitle>
          <CardDescription className="text-xs">
            Posts from these users won't appear in your feeds. Published as NIP-51 kind 10000 mute list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PeoplePicker
            pubkeys={pubkeys}
            onChange={setPubkeys}
            placeholder="Search follows or paste npub/hex…"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocked Keywords</CardTitle>
          <CardDescription className="text-xs">
            Posts containing these words will be hidden. Compatible with Amethyst's word mute list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="gap-1 pr-1">
                  {kw}
                  <button
                    onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))}
                    className="text-muted-foreground hover:text-destructive ml-0.5"
                  >
                    <X size={10} />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
              placeholder="Add keyword to block…"
              className="h-8 text-sm flex-1"
            />
            <Button size="sm" variant="outline" onClick={addKeyword} className="h-8">
              Add
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Case-insensitive. Amethyst and other clients will also respect these.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Block Lists</CardTitle>
          <CardDescription className="text-xs">
            Subscribe to community-maintained blocklists. Any person on these lists will be filtered from your feeds.
            Use a NIP-51 people set (kind 30000) maintained by trusted moderators.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lists.length > 0 && (
            <div className="space-y-2">
              {lists.map((l) => {
                // Try to decode for display
                let display = l;
                const parts = l.split(':');
                if (parts.length === 3) display = `Kind ${parts[0]} list by …${parts[1].slice(-8)}`;
                return (
                  <div key={l} className="flex items-center justify-between gap-2 text-xs bg-card border border-border rounded-lg px-3 py-2">
                    <span className="truncate text-foreground">{display}</span>
                    <button
                      onClick={() => setLists((prev) => prev.filter((x) => x !== l))}
                      className="text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={listInput}
              onChange={(e) => setListInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addList()}
              placeholder="naddr1… or 30000:pubkey:d-tag"
              className="h-8 text-sm flex-1"
            />
            <Button size="sm" variant="outline" onClick={addList} className="h-8">
              Add
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Paste the naddr of a NIP-51 people set or follow list. People in that list will be blocked.
            Great for subscribing to community spam/scam blocklists.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isPending ? (
            <RefreshCw size={14} className="animate-spin mr-2" />
          ) : (
            <Shield size={14} className="mr-2" />
          )}
          Save Block List
        </Button>
        <p className="text-xs text-muted-foreground">
          Publishes as kind 10000 (NIP-51 mute list) — compatible with Amethyst &amp; Damus.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsPage
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const { user } = useCurrentUser();

  useSeoMeta({ title: 'Settings · Mixstr' });

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 py-4">
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Manage your profile, privacy, and block list</p>
      </div>

      <div className="px-4 pt-4">
        <Tabs defaultValue="profile">
          <TabsList className="mb-6 w-full grid grid-cols-2 h-9">
            <TabsTrigger value="profile" className="text-sm gap-2">
              <User size={14} />
              Profile
            </TabsTrigger>
            <TabsTrigger value="blocks" className="text-sm gap-2">
              <Shield size={14} />
              Block List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            {user ? (
              <EditProfileForm />
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <p className="text-muted-foreground text-sm mb-4">Sign in to edit your profile.</p>
                  <LoginArea className="max-w-xs mx-auto" />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="blocks">
            <BlockSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
