import { useState, useMemo, useEffect } from 'react';
import { Plus, GripVertical, X, Wifi, Search, Check, Building2, Users, MessageSquare } from 'lucide-react';
import { useFollowingProfiles, type FollowingProfile } from '@/hooks/useFollowingProfiles';
import { useRecentProfiles } from '@/hooks/useRecentProfiles';
import { profileLabel } from '@/lib/mentions';
import { nip19 } from 'nostr-tools';
import { useDiscoverDvms } from '@/hooks/useDiscoverDvms';
import { useDiscoverCommunities } from '@/hooks/useDiscoverCommunities';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
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
  listTimestamp,
} from '@/lib/sidebarLists';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ListIcon } from './ListIcon';

// Visual icon grid picker — shows the actual icon component for each option
function IconPicker({ value, onChange }: { value: SidebarListIcon; onChange: (v: SidebarListIcon) => void }) {
  return (
    <div>
      <Label className="text-sm">Icon</Label>
      <div className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1.5">
        {ICON_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-lg border transition-all',
              value === opt.value
                ? 'border-primary bg-primary/15 text-primary shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-accent',
            )}
          >
            <ListIcon icon={opt.value} size={16} />
          </button>
        ))}
      </div>
      {/* Show selected label underneath */}
      <p className="text-xs text-muted-foreground mt-1.5">
        Selected: <span className="text-foreground font-medium">{ICON_OPTIONS.find(o => o.value === value)?.label ?? value}</span>
      </p>
    </div>
  );
}

function SearchTermInput({ onAdd }: { onAdd: (term: string) => void }) {
  const [value, setValue] = useState('');

  const handleAdd = () => {
    onAdd(value);
    setValue('');
  };

  return (
    <div className="flex gap-1.5">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
          }
        }}
        placeholder="Type a phrase and press Enter…"
        className="h-7 text-xs bg-background flex-1"
      />
      <Button size="sm" variant="outline" onClick={handleAdd} className="h-7 px-2 text-xs">
        Add
      </Button>
    </div>
  );
}

interface EditListDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: SidebarList;
  onSave: (list: SidebarList) => void;
}

const SOURCE_TYPES: { value: SourceType; label: string; description: string }[] = [
  { value: 'hashtag', label: 'Hashtag', description: 'Posts tagged with a specific #tag' },
  { value: 'keyword', label: 'Search term', description: 'Posts that contain the given search phrase(s)' },
  { value: 'people', label: 'Specific People', description: 'Posts from specific npubs' },
  { value: 'follow-list', label: "Someone's Follows", description: "Use another user's NIP-02 follow list" },
  { value: 'dvm', label: 'DVM Feed', description: 'AI-curated feed from a Data Vending Machine' },
  { value: 'community', label: 'Community (NIP-72)', description: 'Reddit-style Nostr community' },
  { value: 'group', label: 'Group (NIP-29)', description: 'Relay-based closed group' },
  { value: 'livestream', label: 'Livestreams', description: 'NIP-53 live streams (kind 30311)' },
  { value: 'relay', label: 'Single Relay', description: 'Global feed from one specific relay' },
  { value: 'rss', label: 'RSS / Atom Feed', description: 'External blog or news feed' },
  { value: 'fediverse', label: 'Fediverse Actor', description: 'ActivityPub user feed (via proxy)' },
];

/** Only URL/address-based sources benefit from a friendly display-label override. */
function showsDisplayLabel(type: SourceType): boolean {
  return type === 'rss' || type === 'fediverse' || type === 'relay' || type === 'community';
}

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

/** Parse a community address from raw "34550:pubkey:d" or naddr1 input. */
function parseCommunityInput(value: string):
  | { address: string; pubkey: string; identifier: string }
  | undefined {
  const v = value.trim();
  if (!v) return undefined;

  try {
    const decoded = nip19.decode(v);
    if (decoded.type === 'naddr') {
      const data = decoded.data as { kind: number; pubkey: string; identifier: string };
      if (data.kind !== 34550) return undefined;
      return {
        address: `34550:${data.pubkey}:${data.identifier}`,
        pubkey: data.pubkey,
        identifier: data.identifier,
      };
    }
  } catch {
    // fall through to raw format
  }

  const parts = v.split(':');
  if (parts.length !== 3) return undefined;
  const [kind, pubkey, identifier] = parts;
  if (kind !== '34550' || !/^[0-9a-f]{64}$/i.test(pubkey) || !identifier) return undefined;
  return { address: v, pubkey, identifier };
}

/** Autocomplete people picker backed by follows + recently encountered profiles. */
function PeopleField({
  pubkeys,
  onChange,
  label = 'People',
  placeholder = 'Search by name or paste npub…',
}: {
  pubkeys: string[];
  onChange: (pks: string[]) => void;
  label?: string;
  placeholder?: string;
}) {
  const { data: followingProfiles = [], isLoading: followingLoading } = useFollowingProfiles();
  const { data: recentProfiles = [], isLoading: recentLoading } = useRecentProfiles();

  const [search, setSearch] = useState('');
  const [manualInput, setManualInput] = useState('');

  const followPks = useMemo(
    () => new Set(followingProfiles.map((p) => p.pubkey)),
    [followingProfiles],
  );

  // Merge follows and recent encounters, keeping follows first and removing duplicates.
  const allProfiles = useMemo<FollowingProfile[]>(() => {
    const seen = new Set<string>();
    const out: FollowingProfile[] = [];
    for (const p of followingProfiles) {
      if (!seen.has(p.pubkey)) {
        seen.add(p.pubkey);
        out.push(p);
      }
    }
    for (const p of recentProfiles) {
      if (!seen.has(p.pubkey)) {
        seen.add(p.pubkey);
        out.push(p);
      }
    }
    return out;
  }, [followingProfiles, recentProfiles]);

  const q = search.trim().toLowerCase();

  const followingMatches = useMemo(() => {
    if (!q) return [];
    return followingProfiles
      .filter((p) => {
        const label = profileLabel(p).toLowerCase();
        return label.includes(q) || p.pubkey.toLowerCase().startsWith(q);
      })
      .slice(0, 10);
  }, [followingProfiles, q]);

  const recentMatches = useMemo(() => {
    if (!q) return [];
    return recentProfiles
      .filter((p) => {
        const label = profileLabel(p).toLowerCase();
        return label.includes(q) || p.pubkey.toLowerCase().startsWith(q);
      })
      .slice(0, 10);
  }, [recentProfiles, q]);

  const hasSuggestions = followingMatches.length > 0 || recentMatches.length > 0;

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
            const profile = allProfiles.find((p) => p.pubkey === pk);
            const name = profile ? profileLabel(profile) : pk.slice(0, 8) + '…';
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

      {/* Search profiles */}
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={followingProfiles.length > 0 ? 'Search follows & recent…' : 'Search recent people…'}
          className="h-7 text-xs bg-background pl-6"
        />
      </div>

      {/* Suggestion list */}
      {q !== '' && (
        <div className="max-h-40 overflow-y-auto border border-border rounded-md bg-background text-xs">
          {(followingLoading || recentLoading) && !hasSuggestions && (
            <div className="px-2 py-1.5 text-muted-foreground">Loading profiles…</div>
          )}

          {followingMatches.length > 0 && (
            <div className="divide-y divide-border">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/50">
                Following
              </p>
              {followingMatches.map((profile) => (
                <ProfileSuggestionRow
                  key={profile.pubkey}
                  profile={profile}
                  selected={pubkeys.includes(profile.pubkey)}
                  onToggle={() => toggle(profile.pubkey)}
                />
              ))}
            </div>
          )}

          {recentMatches.length > 0 && (
            <div className="divide-y divide-border">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/50">
                Recently encountered
              </p>
              {recentMatches.map((profile) => (
                <ProfileSuggestionRow
                  key={profile.pubkey}
                  profile={profile}
                  selected={pubkeys.includes(profile.pubkey)}
                  onToggle={() => toggle(profile.pubkey)}
                />
              ))}
            </div>
          )}

          {!followingLoading && !recentLoading && !hasSuggestions && (
            <div className="px-2 py-1.5 text-muted-foreground">No matches found.</div>
          )}
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

function ProfileSuggestionRow({
  profile,
  selected,
  onToggle,
}: {
  profile: FollowingProfile;
  selected: boolean;
  onToggle: () => void;
}) {
  const name = profileLabel(profile);
  return (
    <button
      className={cn(
        'flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent transition-colors text-left',
        selected && 'text-primary',
      )}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Avatar className="w-5 h-5 flex-shrink-0">
          <AvatarImage src={profile.picture} />
          <AvatarFallback className="bg-primary/20 text-primary text-[8px] font-bold">
            {name[0]?.toUpperCase() ?? '?'}
          </AvatarFallback>
        </Avatar>
        <span className="truncate">{name}</span>
      </div>
      {selected && <Check size={11} className="flex-shrink-0" />}
    </button>
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
  const [filter, setFilter] = useState('');

  const q = filter.trim().toLowerCase();
  const filteredDvms = useMemo(() => {
    if (!q) return dvms;
    return dvms.filter(
      (dvm) =>
        dvm.name.toLowerCase().includes(q) ||
        dvm.about.toLowerCase().includes(q) ||
        dvm.pubkey.toLowerCase().includes(q),
    );
  }, [dvms, q]);

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">DVM provider</Label>

      {/* Filter */}
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter DVMs…"
          className="h-7 text-xs bg-background pl-6"
        />
      </div>

      {/* Discovered DVMs from network */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
          {isLoading ? (
            <><Loader2 size={10} className="animate-spin" /> Discovering DVMs…</>
          ) : (
            `${filteredDvms.length} DVM${filteredDvms.length !== 1 ? 's' : ''} found`
          )}
        </p>

        {!isLoading && filteredDvms.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            {q ? 'No DVMs match your filter.' : 'No DVMs advertising kind 5300 support found. Enter one manually below.'}
          </p>
        )}

        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
          {filteredDvms.map((dvm) => {
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

/** Community source picker — discover existing communities or create a new one. */
function CommunityField({
  source,
  onChange,
}: {
  source: ListSource;
  onChange: (s: ListSource) => void;
}) {
  const { data: communities = [], isLoading } = useDiscoverCommunities();
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending: isCreating } = useNostrPublish();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');

  const q = filter.trim().toLowerCase();
  const filteredCommunities = useMemo(() => {
    if (!q) return communities;
    return communities.filter(
      (community) =>
        community.name.toLowerCase().includes(q) ||
        (community.description?.toLowerCase().includes(q) ?? false) ||
        community.address.toLowerCase().includes(q),
    );
  }, [communities, q]);

  const selected = parseCommunityInput(source.communityId ?? '');

  const selectCommunity = (address: string, communityName: string) => {
    onChange({ ...source, communityId: address, label: communityName });
  };

  const createCommunity = async () => {
    if (!user?.pubkey || !name.trim() || !identifier.trim()) return;
    const slug = identifier.trim().toLowerCase().replace(/\s+/g, '-');
    await publish({
      kind: 34550,
      content: '',
      tags: [
        ['d', slug],
        ['name', name.trim()],
        ['description', description.trim()],
        ...(image.trim() ? [['image', image.trim()]] : []),
        ['p', user.pubkey, '', 'moderator'],
      ],
    });
    const address = `34550:${user.pubkey}:${slug}`;
    onChange({ ...source, communityId: address, label: name.trim() });
    setShowCreate(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Community</Label>

      {/* Filter */}
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter communities…"
          className="h-7 text-xs bg-background pl-6"
        />
      </div>

      {/* Discovered communities */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
          {isLoading ? (
            <><Loader2 size={10} className="animate-spin" /> Discovering communities…</>
          ) : (
            `${filteredCommunities.length} community${filteredCommunities.length !== 1 ? 'ies' : 'y'} found`
          )}
        </p>

        {!isLoading && filteredCommunities.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            {q
              ? 'No communities match your filter.'
              : 'No communities discovered yet. You can create one below or paste a community address manually.'}
          </p>
        )}

        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
          {filteredCommunities.map((community) => {
            const isSelected = selected?.address === community.address;
            return (
              <button
                key={community.address}
                onClick={() => selectCommunity(community.address, community.name)}
                className={cn(
                  'w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg border text-xs transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background hover:bg-accent',
                )}
              >
                <Avatar className="w-8 h-8 flex-shrink-0 rounded-lg">
                  <AvatarImage src={community.image} />
                  <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold rounded-lg">
                    {community.name[0]?.toUpperCase() ?? <Building2 size={14} />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{community.name}</p>
                  {community.description && (
                    <p className="text-muted-foreground text-[11px] truncate">{community.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/70 flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1">
                      <MessageSquare size={10} />
                      {community.postCount} post{community.postCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={10} />
                      {community.moderators.length} moderator{community.moderators.length !== 1 ? 's' : ''}
                    </span>
                  </p>
                </div>
                {isSelected && <Check size={13} className="flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual address entry */}
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Or enter address / naddr</p>
        <Input
          value={source.communityId ?? ''}
          onChange={(e) => onChange({ ...source, communityId: e.target.value.trim(), label: undefined })}
          placeholder="34550:<pubkey>:<d-tag> or naddr1..."
          className="h-7 text-xs bg-background"
        />
      </div>

      {/* Show unapproved posts */}
      <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
        <div className="space-y-0.5">
          <Label className="text-xs">Show unapproved posts</Label>
          <p className="text-[10px] text-muted-foreground">
            Include posts that have not yet been approved by a moderator. Moderators always see them.
          </p>
        </div>
        <Switch
          checked={source.showUnapproved ?? false}
          onCheckedChange={(checked) => onChange({ ...source, showUnapproved: checked })}
        />
      </div>

      {/* Create community */}
      {user ? (
        <div className="pt-1">
          {!showCreate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCreate(true)}
              className="h-7 text-xs w-full"
            >
              <Plus size={13} className="mr-1.5" />
              Create a community
            </Button>
          ) : (
            <div className="border border-border rounded-lg p-3 space-y-2 bg-background">
              <p className="text-xs font-medium text-foreground">Create new community</p>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    setName(newName);
                    if (!identifier || identifier === name.toLowerCase().replace(/\s+/g, '-')) {
                      setIdentifier(newName.toLowerCase().replace(/\s+/g, '-'));
                    }
                  }}
                  placeholder="My Community"
                  className="h-7 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Identifier (URL slug)</Label>
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="my-community"
                  className="h-7 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Description (optional)</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this community about?"
                  className="h-7 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Image URL (optional)</Label>
                <Input
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://…"
                  className="h-7 text-xs bg-background"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowCreate(false)}
                  className="h-7 text-xs flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void createCommunity()}
                  disabled={!name.trim() || !identifier.trim() || isCreating}
                  className="h-7 text-xs flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isCreating ? <><Loader2 size={12} className="animate-spin mr-1" /> Creating…</> : 'Create'}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Log in to create a community.</p>
      )}

      <p className="text-xs text-muted-foreground">
        NIP-72 Reddit-style community. Posts need moderator approval.
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

      {/* Label override — only for sources whose natural value is a link/address */}
      {showsDisplayLabel(source.type) && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Display label (optional)</Label>
          <Input
            value={source.label ?? ''}
            onChange={(e) => onChange({ ...source, label: e.target.value || undefined })}
            placeholder={typeInfo?.label}
            className="h-7 text-xs bg-background"
          />
        </div>
      )}

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

      {source.type === 'keyword' && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Search terms</Label>
          {source.keywords && source.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {source.keywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="text-xs gap-1 pr-1">
                  {kw}
                  <button
                    onClick={() =>
                      onChange({
                        ...source,
                        keywords: source.keywords?.filter((k) => k !== kw),
                      })
                    }
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X size={10} />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <SearchTermInput
            onAdd={(term) => {
              const normalized = term.trim().toLowerCase();
              if (!normalized) return;
              if (source.keywords?.includes(normalized)) return;
              onChange({
                ...source,
                keywords: [...(source.keywords ?? []), normalized],
              });
            }}
          />
          <p className="text-xs text-muted-foreground">
            Each term is a phrase (spaces allowed). Posts must contain every phrase. Add multiple terms to narrow results.
          </p>
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

      {source.type === 'community' && <CommunityField source={source} onChange={onChange} />}

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

      {source.type === 'relay' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Relay WebSocket URL</Label>
            <Input
              value={source.relayUrl ?? ''}
              onChange={(e) => onChange({ ...source, relayUrl: e.target.value.trim() })}
              placeholder="wss://relay.example.com"
              className="h-7 text-xs bg-background"
            />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Wifi size={11} />
            Connects directly to this relay and shows its global kind-1 feed.
            Great for niche community relays.
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
      createdAt: initial?.createdAt ?? listTimestamp(),
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
          {/* Name */}
          <div className="space-y-1.5">
            <Label>List Name</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My Feed"
              className="bg-background"
              autoFocus
            />
          </div>

          {/* Icon picker */}
          <IconPicker value={icon} onChange={setIcon} />

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
                    {viewOptions.mediaMaxDurationSec === undefined
                      ? 'No limit'
                      : viewOptions.mediaMaxDurationSec === 0
                        ? '0s'
                        : formatDuration(viewOptions.mediaMaxDurationSec)}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={7200}
                  step={30}
                  value={[viewOptions.mediaMaxDurationSec ?? 7200]}
                  onValueChange={([v]) =>
                    setViewOptions((prev) => ({
                      ...prev,
                      mediaMaxDurationSec: v >= 7200 ? undefined : v,
                    }))
                  }
                  className="w-full"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Only shows videos within this range in the media tab. Max duration all the way to the right means no limit; any value up to 2 hours is used as the cap.
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
            disabled={!label.trim() || (!initial && sources.length === 0)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {initial ? 'Save Changes' : 'Create List'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
