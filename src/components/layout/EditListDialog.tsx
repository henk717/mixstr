import { useState } from 'react';
import { Plus, Trash2, GripVertical, X } from 'lucide-react';
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
  type SourceType,
  ICON_OPTIONS,
  createSourceId,
  sourceDescription,
} from '@/lib/sidebarLists';
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
  { value: 'rss', label: 'RSS / Atom Feed', description: 'External blog or news feed' },
  { value: 'fediverse', label: 'Fediverse Actor', description: 'ActivityPub user feed (via proxy)' },
];

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
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">npub or hex pubkeys (one per line)</Label>
          <textarea
            value={(source.pubkeys ?? []).join('\n')}
            onChange={(e) =>
              onChange({
                ...source,
                pubkeys: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="npub1... or hex pubkey"
            className="w-full h-20 text-xs bg-background border border-input rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            {source.pubkeys?.length ?? 0} pubkey(s)
          </p>
        </div>
      )}

      {source.type === 'follow-list' && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">User's npub or hex pubkey</Label>
          <Input
            value={source.followListPubkey ?? ''}
            onChange={(e) => onChange({ ...source, followListPubkey: e.target.value.trim() })}
            placeholder="npub1..."
            className="h-7 text-xs bg-background"
          />
          <p className="text-xs text-muted-foreground">
            This will fetch and use their NIP-02 contact list
          </p>
        </div>
      )}

      {source.type === 'dvm' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">DVM npub / pubkey</Label>
            <Input
              value={source.dvmPubkey ?? ''}
              onChange={(e) => onChange({ ...source, dvmPubkey: e.target.value.trim() })}
              placeholder="npub1... (DVM provider pubkey)"
              className="h-7 text-xs bg-background"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            DVM feeds use NIP-90 Data Vending Machines to return curated content
          </p>
        </div>
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
