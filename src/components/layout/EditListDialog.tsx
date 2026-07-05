import { useState, useMemo, useEffect } from 'react';
import { Plus, GripVertical, X, Wifi, Search, Check } from 'lucide-react';
import { useFollowing } from '@/hooks/useFollowing';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';
import { useDiscoverDvms } from '@/hooks/useDiscoverDvms';
import { Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type SidebarList,
  type SidebarListIcon,
  type ListSource,
  type ListViewOptions,
  type SourceType,
  ICON_OPTIONS,
  createSourceId,
} from '@/lib/sidebarLists';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ListIcon } from './ListIcon';

interface EditListDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: SidebarList;
  onSave: (list: SidebarList) => void;
}

const SOURCE_TYPES: { value: SourceType; label: string; description: string }[] = [
  { value: 'hashtag', label: 'Hashtag', description: 'Posts tagged with a specific #tag' },
  { value: 'people', label: 'Specific People', description: 'Posts from specific npubs' },
  { value: 'follow-list', label: "Someone's Follows", description: "Use another user's NIP-02 follow list" },
  { value: 'dvm', label: 'DVM Feed', description: 'AI-curated feed from a Data Vending Machine' },
  { value: 'community', label: 'Community (NIP-72)', description: 'Reddit-style Nostr community' },
  { value: 'group', label: 'Group (NIP-29)', description: 'Relay-based closed group' },
  { value: 'livestream', label: 'Livestreams', description: 'NIP-53 live streams (kind 30311)' },
  { value: 'rss', label: 'RSS / Atom Feed', description: 'External blog or news feed' },
  { value: 'fediverse', label: 'Fediverse Actor', description: 'ActivityPub user feed (via proxy)' },
];

/** Format seconds into m:ss or h:mm:ss */
function formatDuration(sec: number): string {
  if (sec <= 0) return 'No limit';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
  return `${s}s`;
}

/** Convert npub or hex to hex pubkey, returns undefined if invalid */
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

/** Autocomplete people picker backed by the user's follow list */
function PeopleField({
  pubkeys,
  onChange,
  label = 'People (from your follows)',
  placeholder = 'Search by name or paste npub…',
}: {
  pubkeys: string[];
  onChange: (pks: string[]) => void;
  label?: string;
  placeholder?: string;
}) {
  const { nostr } = useNostr();
  const { data: followingHex = [] } = useFollowing();

  // Fetch metadata for all follows so we can show names
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
        try {
          map[ev.pubkey] = JSON.parse(ev.content) as NostrMetadata;
        } catch {}
      }
      return map;
    },
    enabled: followingHex.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const [search, setSearch] = useState('');
  const [manualInput, setManualInput] = useState('');

  const suggestions = useMemo(() => {
    const q = search.toLowerCase();
    return followingHex
      .map((pk) => {
        const meta = metaMap[pk];
        const name = meta?.display_name || meta?.name || '';
        return { pk, name };
      })
      .filter(({ pk, name }) => {
        if (!q) return true;
        return name.toLowerCase().includes(q) || pk.includes(q);
      })
      .slice(0, 20);
  }, [followingHex, metaMap, search]);

  const toggle = (pk: string) => {
    if (pubkeys.includes(pk)) {
      onChange(pubkeys.filter((p) => p !== pk));
    } else {
      onChange([...pubkeys, pk]);
    }
  };

  const addManual = () => {
    const hex = toHexPubkey(manualInput);
    if (hex && !pubkeys.includes(hex)) {
      onChange([...pubkeys, hex]);
    }
    setManualInput('');
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>

      {/* Chips for selected pubkeys */}
      {pubkeys.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pubkeys.map((pk) => {
            const meta = metaMap[pk];
            const name = meta?.display_name || meta?.name || pk.slice(0, 8) + '…';
            return (
              <Badge key={pk} variant="secondary" className="text-xs gap-1 pr-1">
                {name}
                <button
                  onClick={() => onChange(pubkeys.filter((p) => p !== pk))}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X size={10} />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Search follows */}
      {followingHex.length > 0 && (
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your follows…"
            className="h-7 text-xs bg-background pl-6"
          />
        </div>
      )}

      {/* Suggestion list */}
      {search !== '' && suggestions.length > 0 && (
        <div className="max-h-32 overflow-y-auto border border-border rounded-md bg-background text-xs divide-y divide-border">
          {suggestions.map(({ pk, name }) => {
            const selected = pubkeys.includes(pk);
            return (
              <button
                key={pk}
                className={cn(
                  'flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent transition-colors text-left',
                  selected && 'text-primary',
                )}
                onClick={() => toggle(pk)}
              >
                <span className="truncate">{name || pk.slice(0, 12) + '…'}</span>
                {selected && <Check size={11} className="flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Manual npub/hex input */}
      <div className="flex gap-1.5">
        <Input
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addManual()}
          placeholder={placeholder}
          className="h-7 text-xs bg-background flex-1"
        />
        <Button size="sm" variant="outline" onClick={addManual} className="h-7 px-2 text-xs">
          Add
        </Button>
      </div>
    </div>
  );
}

/** DVM source picker — discovers live DVMs from the network via NIP-89 */
function DvmField({
  dvmPubkey,
  onChange,
}: {
  dvmPubkey: string;
  onChange: (pk: string) => void;
}) {
  const { data: dvms = [], isLoading } = useDiscoverDvms();

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">DVM provider</Label>

      {/* Discovered DVMs from network */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
          {isLoading ? (
            <><Loader2 size={10} className="animate-spin" /> Discovering DVMs…</>
          ) : (
            `${dvms.length} DVM${dvms.length !== 1 ? 's' : ''} found on network`
          )}
        </p>

        {!isLoading && dvms.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            No DVMs advertising kind 5300 support found. Enter one manually below.
          </p>
        )}

        {dvms.map((dvm) => {
          const isSelected = dvmPubkey === dvm.pubkey;
          return (
            <button
              key={dvm.pubkey}
              onClick={() => onChange(dvm.pubkey)}
              className={cn(
                'w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg border text-xs transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background hover:bg-accent',
              )}
            >
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarImage src={dvm.picture} />
                <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold">
                  {dvm.name[0]?.toUpperCase() ?? 'D'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{dvm.name}</p>
                <p className="text-muted-foreground text-[11px] truncate">{dvm.about}</p>
              </div>
              {isSelected && <Check size={13} className="flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Manual npub entry */}
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
          Or enter npub / hex manually
        </p>
        <Input
          value={dvmPubkey}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="npub1… or 64-char hex pubkey"
          className="h-7 text-xs bg-background"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        DVM feeds use NIP-90 kind 5300 requests — the provider returns a curated list of events.
      </p>
    </div>
  );
}

function SourceEditor({
  source,
  onChange,
  onRemove,
}: {
  source: ListSource;
  onChange: (s: ListSource) => void;
  onRemove: () => void;
}) {
  const typeInfo = SOURCE_TYPES.find((t) => t.value === source.type);

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <GripVertical size={13} className="text-muted-foreground cursor-grab" />
          {typeInfo?.label ?? source.type}
        </div>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
        >
          <X size={14} />
        </button>
      </div>

      {/* Label override */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Display label (optional)</Label>
        <Input
          value={source.label ?? ''}
          onChange={(e) => onChange({ ...source, label: e.target.value || undefined })}
          placeholder={typeInfo?.label}
          className="h-7 text-xs bg-background"
        />
      </div>

      {/* Type-specific fields */}
      {source.type === 'hashtag' && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Hashtag (without #)</Label>
          <Input
            value={source.tag ?? ''}
            onChange={(e) => onChange({ ...source, tag: e.target.value.replace('#', '') })}
            placeholder="bitcoin"
            className="h-7 text-xs bg-background"
          />
        </div>
      )}

      {source.type === 'people' && (
        <PeopleField
          pubkeys={source.pubkeys ?? []}
          onChange={(pubkeys) => onChange({ ...source, pubkeys })}
        />
      )}

      {source.type === 'follow-list' && (
        <div className="space-y-2">
          <PeopleField
            pubkeys={source.followListPubkey ? [source.followListPubkey] : []}
            onChange={(pks) => onChange({ ...source, followListPubkey: pks[0] ?? '' })}
            label="Whose follow list to use"
            placeholder="Search or paste npub1…"
          />
          <p className="text-xs text-muted-foreground">
            Fetches and uses their NIP-02 contact list as the source.
          </p>
        </div>
      )}

      {source.type === 'dvm' && (
        <DvmField
          dvmPubkey={source.dvmPubkey ?? ''}
          onChange={(dvmPubkey) => onChange({ ...source, dvmPubkey })}
        />
      )}

      {source.type === 'community' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Community address</Label>
            <Input
              value={source.communityId ?? ''}
              onChange={(e) => onChange({ ...source, communityId: e.target.value.trim() })}
              placeholder="34550:<pubkey>:<d-tag> or naddr1..."
              className="h-7 text-xs bg-background"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            NIP-72 Reddit-style community. Posts need moderator approval.
          </p>
        </div>
      )}

      {source.type === 'group' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Group ID</Label>
            <Input
              value={source.groupId ?? ''}
              onChange={(e) => onChange({ ...source, groupId: e.target.value.trim() })}
              placeholder="group-id"
              className="h-7 text-xs bg-background"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Group Relay URL</Label>
            <Input
              value={source.groupRelay ?? ''}
              onChange={(e) => onChange({ ...source, groupRelay: e.target.value.trim() })}
              placeholder="wss://relay.example.com"
              className="h-7 text-xs bg-background"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            NIP-29 relay-based group. Members-only write access.
          </p>
        </div>
      )}

      {source.type === 'livestream' && (
        <div className="space-y-2">
          <PeopleField
            pubkeys={source.pubkeys ?? []}
            onChange={(pubkeys) => onChange({ ...source, pubkeys })}
            label="Filter by authors (optional)"
            placeholder="Leave empty for all livestreams"
          />
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Wifi size={11} />
            Shows NIP-53 live streams. Leave authors empty to see all.
          </p>
        </div>
      )}

      {(source.type === 'rss' || source.type === 'fediverse') && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            {source.type === 'rss' ? 'RSS/Atom feed URL' : 'ActivityPub actor URL'}
          </Label>
          <Input
            value={source.url ?? ''}
            onChange={(e) => onChange({ ...source, url: e.target.value.trim() })}
            placeholder={
              source.type === 'rss'
                ? 'https://blog.example.com/feed.xml'
                : 'https://mastodon.social/@user'
            }
            className="h-7 text-xs bg-background"
          />
          {source.type === 'fediverse' && (
            <p className="text-xs text-muted-foreground">
              Fetched via CORS proxy. Some servers may block this.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function EditListDialog({ open, onClose, initial, onSave }: EditListDialogProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [icon, setIcon] = useState<SidebarListIcon>(initial?.icon ?? 'hash');
  const [sources, setSources] = useState<ListSource[]>(initial?.sources ?? []);
  const [newSourceType, setNewSourceType] = useState<SourceType>('hashtag');
  const [viewOptions, setViewOptions] = useState<ListViewOptions>(initial?.viewOptions ?? {});

  // Reset all form state whenever the dialog opens (or opens for a different list).
  // useState only runs its initializer once at mount, so without this effect
  // editing a second list would still show the first list's values.
  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? '');
    setIcon(initial?.icon ?? 'hash');
    setSources(initial?.sources ?? []);
    setNewSourceType('hashtag');
    setViewOptions(initial?.viewOptions ?? {});
  }, [open, initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addSource = () => {
    setSources((prev) => [
      ...prev,
      { id: createSourceId(), type: newSourceType },
    ]);
  };

  const updateSource = (idx: number, s: ListSource) => {
    setSources((prev) => prev.map((x, i) => (i === idx ? s : x)));
  };

  const removeSource = (idx: number) => {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({
      id: initial?.id ?? `list-${Date.now()}`,
      label: label.trim(),
      icon,
      sources,
      pinned: initial?.pinned,
      createdAt: initial?.createdAt ?? Date.now(),
      viewOptions,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {initial ? 'Edit List' : 'New Sidebar List'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name + Icon row */}
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>List Name</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="My Feed"
                className="bg-background"
                autoFocus
              />
            </div>
            <div className="w-32 space-y-1.5">
              <Label>Icon</Label>
              <Select value={icon} onValueChange={(v) => setIcon(v as SidebarListIcon)}>
                <SelectTrigger className="bg-background">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <ListIcon icon={icon} size={14} className="text-primary" />
                      <span className="text-xs">
                        {ICON_OPTIONS.find((o) => o.value === icon)?.label.split(' ').slice(1).join(' ')}
                      </span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {ICON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sources */}
          <div className="space-y-2">
            <Label>Sources</Label>
            <p className="text-xs text-muted-foreground">
              Add one or more sources — posts from all sources are merged into one feed.
            </p>

            {sources.length === 0 && (
              <div className="border border-dashed border-border rounded-lg p-4 text-center text-xs text-muted-foreground">
                No sources yet. Add at least one below.
              </div>
            )}

            {sources.map((src, i) => (
              <SourceEditor
                key={src.id}
                source={src}
                onChange={(s) => updateSource(i, s)}
                onRemove={() => removeSource(i)}
              />
            ))}

            {/* Add source row */}
            <div className="flex items-center gap-2 mt-2">
              <Select value={newSourceType} onValueChange={(v) => setNewSourceType(v as SourceType)}>
                <SelectTrigger className="flex-1 bg-background text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      <div>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-muted-foreground text-[11px]">{t.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={addSource}
                className="gap-1.5 h-8 border-primary/40 hover:border-primary hover:text-primary"
              >
                <Plus size={13} />
                Add
              </Button>
            </div>
          </div>

          {/* View Options */}
          <div className="space-y-3 border-t border-border pt-4">
            <Label className="text-sm font-semibold">View Options</Label>

            {/* Livestream pinning toggle */}
            <div className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
              <div>
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Wifi size={12} className="text-red-500" />
                  Pin live streams to top
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Ongoing NIP-53 streams float above the feed when active
                </p>
              </div>
              <Switch
                checked={viewOptions.showLivestreamsAtTop ?? false}
                onCheckedChange={(v) => setViewOptions((prev) => ({ ...prev, showLivestreamsAtTop: v }))}
              />
            </div>

            {/* Video duration filter */}
            <div className="bg-card border border-border rounded-lg p-3 space-y-3">
              <p className="text-xs font-medium text-foreground">Video duration filter (media tab)</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Min duration</Label>
                  <span className="text-xs text-muted-foreground">
                    {viewOptions.mediaMinDurationSec
                      ? formatDuration(viewOptions.mediaMinDurationSec)
                      : 'No limit'}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={600}
                  step={5}
                  value={[viewOptions.mediaMinDurationSec ?? 0]}
                  onValueChange={([v]) => setViewOptions((prev) => ({ ...prev, mediaMinDurationSec: v || undefined }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Max duration</Label>
                  <span className="text-xs text-muted-foreground">
                    {viewOptions.mediaMaxDurationSec
                      ? formatDuration(viewOptions.mediaMaxDurationSec)
                      : 'No limit'}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={7200}
                  step={30}
                  value={[viewOptions.mediaMaxDurationSec ?? 0]}
                  onValueChange={([v]) => setViewOptions((prev) => ({ ...prev, mediaMaxDurationSec: v || undefined }))}
                  className="w-full"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Only shows videos within this range in the media tab. 0 = no limit.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!label.trim() || sources.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {initial ? 'Save Changes' : 'Create List'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
