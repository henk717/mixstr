/**
 * Mixstr configurable sidebar lists.
 *
 * Each "list" is a named feed that can aggregate multiple sources.
 * Lists are stored in localStorage under 'mixstr:sidebar-lists'.
 */

export type SourceType =
  | 'hashtag'       // Nostr #t tag feed
  | 'dvm'           // DVM-powered feed (kind 5300/6300)
  | 'people'        // Specific pubkeys
  | 'follow-list'   // Someone else's NIP-02 follow list
  | 'community'     // NIP-72 moderated community (kind 34550)
  | 'group'         // NIP-29 relay-based group
  | 'livestream'    // NIP-53 livestreams (kind 30311)
  | 'rss'           // External RSS/Atom feed via proxy
  | 'fediverse';    // ActivityPub actor feed via proxy

export interface ListSource {
  id: string;
  type: SourceType;
  /** Display label override */
  label?: string;

  // hashtag
  tag?: string;

  // dvm
  dvmPubkey?: string;
  dvmKind?: number;

  // people / follow-list / livestream
  pubkeys?: string[];
  followListPubkey?: string;

  // community (NIP-72)
  communityId?: string;        // "34550:<pubkey>:<d-tag>"
  communityPubkey?: string;

  // group (NIP-29)
  groupId?: string;
  groupRelay?: string;

  // rss / fediverse
  url?: string;
}

export type SidebarListIcon =
  | 'home'
  | 'hash'
  | 'zap'
  | 'users'
  | 'image'
  | 'music'
  | 'radio'
  | 'rss'
  | 'globe'
  | 'star'
  | 'heart'
  | 'bookmark'
  | 'newspaper'
  | 'gamepad'
  | 'flask'
  | 'lightning'
  | 'community'
  | 'group'
  | 'live';

export interface ListViewOptions {
  /** Show live streams pinned at the top (opt-in). Default: false */
  showLivestreamsAtTop?: boolean;
  /** Media view: minimum video duration in seconds (0 = no limit) */
  mediaMinDurationSec?: number;
  /** Media view: maximum video duration in seconds (0 = no limit) */
  mediaMaxDurationSec?: number;
}

export interface SidebarList {
  id: string;
  label: string;
  icon: SidebarListIcon;
  sources: ListSource[];
  /** Pinned to top (appears before separator) */
  pinned?: boolean;
  createdAt: number;
  /** Per-list view options */
  viewOptions?: ListViewOptions;
}

export const DEFAULT_LISTS: SidebarList[] = [
  {
    id: 'following',
    label: 'Following',
    icon: 'home',
    sources: [{ id: 'following-feed', type: 'people', label: 'My following list' }],
    pinned: true,
    createdAt: 0,
  },
];

const STORAGE_KEY = 'mixstr:sidebar-lists';

export function loadSidebarLists(): SidebarList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LISTS;
    const parsed = JSON.parse(raw) as SidebarList[];
    if (!Array.isArray(parsed)) return DEFAULT_LISTS;
    return parsed;
  } catch {
    return DEFAULT_LISTS;
  }
}

export function saveSidebarLists(lists: SidebarList[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export function createListId(): string {
  return `list-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createSourceId(): string {
  return `src-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Human-readable description of a source for display in the edit dialog */
export function sourceDescription(source: ListSource): string {
  switch (source.type) {
    case 'hashtag': return `#${source.tag ?? '?'}`;
    case 'dvm': return `DVM: ${source.label ?? source.dvmPubkey?.slice(0, 12) ?? '?'}`;
    case 'people': return `${source.pubkeys?.length ?? 0} people`;
    case 'follow-list': return `Follow list of ${source.label ?? source.followListPubkey?.slice(0, 12) ?? '?'}`;
    case 'community': return `Community: ${source.label ?? source.communityId?.split(':')[2] ?? '?'}`;
    case 'group': return `Group: ${source.label ?? source.groupId ?? '?'}`;
    case 'livestream': return source.pubkeys?.length ? `Livestreams (${source.pubkeys.length} authors)` : 'All livestreams';
    case 'rss': return `RSS: ${source.url ?? '?'}`;
    case 'fediverse': return `Fediverse: ${source.url ?? '?'}`;
    default: return 'Unknown';
  }
}

export const ICON_OPTIONS: { value: SidebarListIcon; label: string }[] = [
  { value: 'home', label: '🏠 Home' },
  { value: 'hash', label: '# Hashtag' },
  { value: 'zap', label: '⚡ Zap' },
  { value: 'users', label: '👥 People' },
  { value: 'image', label: '🖼 Media' },
  { value: 'music', label: '🎵 Music' },
  { value: 'radio', label: '📻 Radio' },
  { value: 'live', label: '📡 Live' },
  { value: 'rss', label: '📡 RSS' },
  { value: 'globe', label: '🌐 Globe' },
  { value: 'star', label: '⭐ Star' },
  { value: 'heart', label: '❤️ Heart' },
  { value: 'bookmark', label: '🔖 Bookmark' },
  { value: 'newspaper', label: '📰 News' },
  { value: 'gamepad', label: '🎮 Gaming' },
  { value: 'flask', label: '🔬 Science' },
  { value: 'lightning', label: '🔥 Lightning' },
  { value: 'community', label: '🏛 Community' },
  { value: 'group', label: '💬 Group' },
];

// DVM providers are now discovered live from the network via useDiscoverDvms
// (NIP-89 kind 31990 events with k=5300). No hardcoded list needed.
