import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSeoMeta } from '@unhead/react';
import { User, Shield, X, Plus, Search, Check, RefreshCw, Wifi, Trash2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowing } from '@/hooks/useFollowing';
import { useNostr } from '@nostrify/react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { useMixstr } from '@/hooks/useMixstr';
import { useMuteList } from '@/hooks/useMuteList';
import { EditProfileForm } from '@/components/EditProfileForm';
import { LoginArea } from '@/components/auth/LoginArea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { SUGGESTED_RELAYS } from '@/lib/appRelays';
import type { SpamSettings } from '@/lib/spam';
import type { NostrMetadata } from '@nostrify/nostrify';

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
// Block Settings — NIP-51 kind 10000 mute list + spam detection
// ---------------------------------------------------------------------------

function SpamToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="flex-shrink-0" />
    </div>
  );
}

function BlockSettings() {
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { muted, blockListPubkeys } = useMuteList();
  const { spamSettings, setSpamSettings } = useMixstr();

  const remote = useMemo(
    () => ({
      pubkeys: Array.from(muted.pubkeys),
      keywords: muted.keywords,
      lists: muted.lists,
    }),
    [muted],
  );

  const [pubkeys, setPubkeys] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [lists, setLists] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [listInput, setListInput] = useState('');

  // Sync remote → local once loaded so the settings page opens instantly.
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!synced) {
      setPubkeys(remote.pubkeys);
      setKeywords(remote.keywords);
      setLists(remote.lists);
      setSynced(true);
    }
  }, [synced, remote]);

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
      toast({
        title: 'Block list saved',
        description: 'Your mute/block settings have been published to Nostr.',
      });
    } catch {
      toast({
        title: 'Failed to save',
        description: 'Could not publish block list. Try again.',
        variant: 'destructive',
      });
    }
  };

  const updateSpam = useCallback(
    (patch: Partial<SpamSettings>) => {
      setSpamSettings({ ...spamSettings, ...patch });
    },
    [spamSettings, setSpamSettings],
  );

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
            {blockListPubkeys.size > 0 && (
              <span className="block mt-1 text-primary">
                {blockListPubkeys.size} additional {blockListPubkeys.size === 1 ? 'person' : 'people'} currently blocked via subscribed lists.
              </span>
            )}
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
                  <div
                    key={l}
                    className="flex items-center justify-between gap-2 text-xs bg-card border border-border rounded-lg px-3 py-2"
                  >
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatic Spam Detection</CardTitle>
          <CardDescription className="text-xs">
            Client-side filters that hide spam from your feeds. These settings are stored with your
            Mixstr backup and never published as public events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <SpamToggle
            label="Web of Trust"
            description="Block accounts that have more reports than follows from people I follow, when they aren't followed by anyone in my network."
            checked={spamSettings.webOfTrust.enabled}
            onCheckedChange={(checked) =>
              updateSpam({ webOfTrust: { ...spamSettings.webOfTrust, enabled: checked } })
            }
          />
          {spamSettings.webOfTrust.enabled && (
            <div className="flex items-center gap-2 pb-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Look-back window</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={spamSettings.webOfTrust.windowDays}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v > 0) {
                    updateSpam({ webOfTrust: { ...spamSettings.webOfTrust, windowDays: v } });
                  }
                }}
                className="h-7 text-sm w-20"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          )}

          <SpamToggle
            label="Hashtag spam"
            description="Hide posts that are overloaded with hashtag tags."
            checked={spamSettings.hashtag.enabled}
            onCheckedChange={(checked) =>
              updateSpam({ hashtag: { ...spamSettings.hashtag, enabled: checked } })
            }
          />
          {spamSettings.hashtag.enabled && (
            <div className="flex items-center gap-2 pb-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Max hashtags</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={spamSettings.hashtag.maxTags}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v > 0) {
                    updateSpam({ hashtag: { ...spamSettings.hashtag, maxTags: v } });
                  }
                }}
                className="h-7 text-sm w-20"
              />
            </div>
          )}

          <SpamToggle
            label="Inhuman posting speed"
            description="Hide accounts that publish more posts than a human realistically could within a short rolling window."
            checked={spamSettings.speed.enabled}
            onCheckedChange={(checked) =>
              updateSpam({ speed: { ...spamSettings.speed, enabled: checked } })
            }
          />
          {spamSettings.speed.enabled && (
            <div className="flex flex-wrap items-center gap-2 pb-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">More than</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={spamSettings.speed.maxEvents}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v > 0) {
                    updateSpam({ speed: { ...spamSettings.speed, maxEvents: v } });
                  }
                }}
                className="h-7 text-sm w-20"
              />
              <Label className="text-xs text-muted-foreground whitespace-nowrap">posts in</Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={spamSettings.speed.windowMinutes}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v > 0) {
                    updateSpam({ speed: { ...spamSettings.speed, windowMinutes: v } });
                  }
                }}
                className="h-7 text-sm w-20"
              />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          )}

          <SpamToggle
            label="JSON / base64 spam"
            description="Hide posts whose content looks like raw JSON or a base64 blob rather than human-readable text. Known structured kinds such as livestreams, audio, and articles are always kept."
            checked={spamSettings.readability.enabled}
            onCheckedChange={(checked) =>
              updateSpam({ readability: { ...spamSettings.readability, enabled: checked } })
            }
          />
          {spamSettings.readability.enabled && (
            <div className="flex items-center gap-2 pb-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Min base64 length</Label>
              <Input
                type="number"
                min={20}
                max={500}
                value={spamSettings.readability.minBase64Length}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v > 0) {
                    updateSpam({ readability: { ...spamSettings.readability, minBase64Length: v } });
                  }
                }}
                className="h-7 text-sm w-20"
              />
              <span className="text-xs text-muted-foreground">chars</span>
            </div>
          )}
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
// Relay Settings
// ---------------------------------------------------------------------------

interface RelayEntry {
  url: string;
  read: boolean;
  write: boolean;
}

function RelaySettings() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending: isPublishing } = useNostrPublish();
  const { toast } = useToast();

  const [relays, setRelays] = useState<RelayEntry[]>(
    () => config.relayMetadata.relays.map((r) => ({ ...r })),
  );
  const [urlInput, setUrlInput] = useState('');

  const addRelay = () => {
    const raw = urlInput.trim();
    if (!raw) return;
    const url = raw.startsWith('wss://') || raw.startsWith('ws://') ? raw : `wss://${raw}`;
    if (!relays.find((r) => r.url === url)) {
      setRelays((prev) => [...prev, { url, read: true, write: true }]);
    }
    setUrlInput('');
  };

  const addSuggested = (url: string) => {
    if (!relays.find((r) => r.url === url)) {
      setRelays((prev) => [...prev, { url, read: true, write: true }]);
    }
  };

  const removeRelay = (url: string) =>
    setRelays((prev) => prev.filter((r) => r.url !== url));

  const toggleRead = (url: string) =>
    setRelays((prev) =>
      prev.map((r) => (r.url === url ? { ...r, read: !r.read } : r)),
    );

  const toggleWrite = (url: string) =>
    setRelays((prev) =>
      prev.map((r) => (r.url === url ? { ...r, write: !r.write } : r)),
    );

  const handleSave = async () => {
    const now = Math.floor(Date.now() / 1000);
    updateConfig((current) => ({
      ...current,
      relayMetadata: { relays, updatedAt: now },
    }));

    // Publish NIP-65 kind 10002 event so other clients know our relay list
    if (user) {
      try {
        const tags: string[][] = relays.map(({ url, read, write }) => {
          if (read && write) return ['r', url];
          if (read) return ['r', url, 'read'];
          return ['r', url, 'write'];
        });
        await publish({ kind: 10002, content: '', tags });
        toast({ title: 'Relays saved & published', description: `NIP-65 relay list published to Nostr.` });
      } catch {
        toast({ title: 'Relays saved locally', description: 'Could not publish NIP-65 event, but config is saved.', variant: 'default' });
      }
    } else {
      toast({ title: 'Relays saved', description: `${relays.length} relay${relays.length !== 1 ? 's' : ''} configured.` });
    }
  };

  const unusedSuggestions = SUGGESTED_RELAYS.filter(
    (s) => !relays.find((r) => r.url === s.url),
  );

  return (
    <div className="space-y-6">
      {/* Privacy notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">You control all relay connections.</span>{' '}
            Mixstr never connects to relays you haven't added here. Read relays are used to
            fetch content; write relays receive your published events (inbox/outbox model).
          </p>
        </CardContent>
      </Card>

      {/* Current relays */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Your Relays</Label>
          <span className="text-xs text-muted-foreground">{relays.length} configured</span>
        </div>

        {relays.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Wifi size={24} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No relays configured. Add one below.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_44px_44px_32px] gap-2 px-3 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
              <span>Relay URL</span>
              <span className="text-center">Read</span>
              <span className="text-center">Write</span>
              <span />
            </div>

            {relays.map((relay) => (
              <div
                key={relay.url}
                className="grid grid-cols-[1fr_44px_44px_32px] gap-2 items-center px-3 py-2.5 rounded-xl border border-border bg-card"
              >
                <p className="font-mono text-xs truncate text-foreground">{relay.url}</p>

                {/* Read toggle */}
                <div className="flex justify-center">
                  <Switch
                    checked={relay.read}
                    onCheckedChange={() => toggleRead(relay.url)}
                    className="scale-75 origin-center"
                  />
                </div>

                {/* Write toggle */}
                <div className="flex justify-center">
                  <Switch
                    checked={relay.write}
                    onCheckedChange={() => toggleWrite(relay.url)}
                    className="scale-75 origin-center"
                  />
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeRelay(relay.url)}
                  className="text-muted-foreground hover:text-destructive transition-colors flex justify-center"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add custom relay */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Add Relay</Label>
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRelay()}
            placeholder="wss://relay.example.com"
            className="font-mono text-sm h-9"
          />
          <Button size="sm" variant="outline" onClick={addRelay} className="h-9 flex-shrink-0">
            <Plus size={14} className="mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Suggestions */}
      {unusedSuggestions.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-muted-foreground">Suggestions</Label>
          <div className="space-y-1.5">
            {unusedSuggestions.map(({ url, description }) => (
              <button
                key={url}
                onClick={() => addSuggested(url)}
                className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-sm group"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs truncate text-foreground">{url}</p>
                  <p className="text-[11px] text-muted-foreground">{description}</p>
                </div>
                <Plus size={14} className="text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={isPublishing}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {isPublishing ? (
          <RefreshCw size={14} className="mr-2 animate-spin" />
        ) : (
          <Wifi size={14} className="mr-2" />
        )}
        Save Relay Configuration
      </Button>

      <p className="text-xs text-muted-foreground">
        Changes take effect immediately. Your NIP-65 relay list is also published to Nostr
        when you save so other clients can use the inbox/outbox model to reach you.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsPage
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isResyncing, setIsResyncing] = useState(false);

  useSeoMeta({ title: 'Settings · Mixstr' });

  const handleResync = async () => {
    if (!user || isResyncing) return;
    setIsResyncing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['nostr', 'mute-list', user.pubkey] }),
        queryClient.invalidateQueries({ queryKey: ['nostr', 'following', user.pubkey] }),
        queryClient.invalidateQueries({ queryKey: ['nostr', 'author', user.pubkey] }),
        queryClient.invalidateQueries({ queryKey: ['nostr', 'trust-metrics', user.pubkey] }),
      ]);
      toast({
        title: 'Resyncing from relays',
        description: 'Profile, follows, block list, and trust data are being refreshed.',
      });
    } finally {
      setIsResyncing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage your profile, relays, and privacy</p>
        </div>
        {user && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleResync()}
            disabled={isResyncing}
            className="flex-shrink-0 h-8"
          >
            <RefreshCw size={12} className={cn('mr-1.5', isResyncing && 'animate-spin')} />
            Resync
          </Button>
        )}
      </div>

      <div className="px-4 pt-4">
        <Tabs defaultValue="profile">
          <TabsList className="mb-6 w-full grid grid-cols-3 h-9">
            <TabsTrigger value="profile" className="text-sm gap-1.5">
              <User size={13} />
              Profile
            </TabsTrigger>
            <TabsTrigger value="relays" className="text-sm gap-1.5">
              <Wifi size={13} />
              Relays
            </TabsTrigger>
            <TabsTrigger value="blocks" className="text-sm gap-1.5">
              <Shield size={13} />
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

          <TabsContent value="relays">
            <RelaySettings />
          </TabsContent>

          <TabsContent value="blocks">
            <BlockSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
