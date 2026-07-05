import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

/** Minimal shape of a publish function for DVM job requests. */
export interface DvmPublish {
  (template: { kind: number; content: string; tags?: string[][]; created_at?: number }): Promise<NostrEvent>;
}

/** Minimal Nostr pool shape used by DVM helpers. */
export interface DvmNostrPool {
  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal; relays?: string[] },
  ): AsyncIterable<unknown>;
  query(filters: NostrFilter[], opts?: { signal?: AbortSignal; relays?: string[] }): Promise<NostrEvent[]>;
}

/** Reference to an addressable (NIP-33) event. */
export interface DvmAddressableRef {
  kind: number;
  pubkey: string;
  identifier: string;
}

/** References extracted from one or more DVM result events. */
export interface DvmReferences {
  ids: string[];
  addresses: DvmAddressableRef[];
}

/** Options for fetchDvmFeedEvents. */
export interface FetchDvmFeedOptions {
  nostr: DvmNostrPool;
  publish: DvmPublish;
  user: { pubkey: string } | null | undefined;
  dvmPubkey: string;
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 15_000;
const MAX_RESULT_EVENTS = 25;
const ID_CHUNK_SIZE = 50;
const SINCE_WINDOW_SECONDS = 7 * 24 * 60 * 60;

/**
 * Decode npub/nprofile/hex to a hex pubkey.
 */
export function toPubkeyHex(value: string): string {
  if (!value) return '';
  if (/^[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
  if (value.startsWith('npub1') || value.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === 'npub') return decoded.data;
      if (decoded.type === 'nprofile') return decoded.data.pubkey;
    } catch {
      // fall through
    }
  }
  return '';
}

/**
 * Request a curated feed from a NIP-90 kind-5300 DVM and fetch the referenced
 * events. Uses a live subscription so results published after EOSE are still
 * captured.
 */
export async function fetchDvmFeedEvents(options: FetchDvmFeedOptions): Promise<NostrEvent[]> {
  const { nostr, publish, user, dvmPubkey, limit = 30, timeoutMs = DEFAULT_TIMEOUT, signal } = options;
  const dvmHex = toPubkeyHex(dvmPubkey);
  if (!dvmHex) return [];

  const since = Math.floor(Date.now() / 1000) - SINCE_WINDOW_SECONDS;

  const requestTags: string[][] = [
    ['p', dvmHex],
    ['output', 'application/json'],
    ['param', 'limit', String(limit)],
    ['param', 'since', String(since)],
  ];

  if (user?.pubkey) {
    requestTags.push(['param', 'p', user.pubkey]);
  }

  const readRelays = getReadRelays();
  if (readRelays.length > 0) {
    requestTags.push(['relays', ...readRelays]);
  }

  const filters: NostrFilter[] = [{ kinds: [6300], authors: [dvmHex], limit: MAX_RESULT_EVENTS, since }];
  let requestId: string | undefined;

  if (user) {
    try {
      const requestEvent = await publish({ kind: 5300, content: '', tags: requestTags });
      requestId = requestEvent.id;
      filters.push({ kinds: [6300], authors: [dvmHex], '#e': [requestId], limit: MAX_RESULT_EVENTS });
    } catch {
      // If publishing fails (no write relays, etc.) fall back to pre-published results.
    }
  }

  const resultEvents = await collectDvmResults(nostr, filters, limit, timeoutMs, signal);
  if (resultEvents.length === 0) return [];

  const refs = extractDvmReferences(resultEvents);
  return fetchReferencedEvents(nostr, refs, signal);
}

/**
 * Collect kind-6300 DVM result events using a live subscription. Stops early
 * if enough event references have been gathered, otherwise waits the full
 * timeout so late-arriving results are captured.
 */
async function collectDvmResults(
  nostr: DvmNostrPool,
  filters: NostrFilter[],
  targetRefs: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<NostrEvent[]> {
  const results: NostrEvent[] = [];
  const seen = new Set<string>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let abortedEarly = false;

  try {
    for await (const msg of nostr.req(filters, { signal: AbortSignal.any([signal, controller.signal].filter(Boolean) as AbortSignal[]) })) {
      if (abortedEarly) break;
      const event = parseEventMessage(msg);
      if (!event || seen.has(event.id)) continue;
      seen.add(event.id);
      results.push(event);

      // If we have enough references there is no need to wait the full window.
      const refs = extractDvmReferences(results);
      if (refs.ids.length + refs.addresses.length >= targetRefs) {
        abortedEarly = true;
        controller.abort();
      }
    }
  } catch (error) {
    // Expected when our timeout/abort fires or the caller cancels.
    if (!isAbortError(error)) throw error;
  } finally {
    clearTimeout(timer);
  }

  // Sort newest result events first so references from fresher results take
  // precedence when deduplicating.
  return results.sort((a, b) => b.created_at - a.created_at);
}

/** Extract references (event IDs and addressable coordinates) from results. */
export function extractDvmReferences(results: NostrEvent[]): DvmReferences {
  const ids: string[] = [];
  const addresses: DvmAddressableRef[] = [];
  const seenIds = new Set<string>();
  const seenAddresses = new Set<string>();

  const addId = (value: string) => {
    const clean = value.trim().toLowerCase();
    if (clean.length === 64 && /^[0-9a-f]+$/.test(clean) && !seenIds.has(clean)) {
      seenIds.add(clean);
      ids.push(clean);
    }
  };

  const addAddress = (kind: number, pubkey: string, identifier: string) => {
    if (!pubkey) return;
    const key = `${kind}:${pubkey}:${identifier}`;
    if (!seenAddresses.has(key)) {
      seenAddresses.add(key);
      addresses.push({ kind, pubkey, identifier });
    }
  };

  const parseAddressable = (value: string) => {
    const parts = value.split(':');
    if (parts.length < 3) return;
    const kind = Number(parts[0]);
    const pubkey = parts[1] ?? '';
    const identifier = parts.slice(2).join(':');
    if (!Number.isNaN(kind) && pubkey) {
      addAddress(kind, pubkey, identifier);
    }
  };

  const parseItem = (item: unknown) => {
    if (typeof item === 'string') {
      addId(item);
      return;
    }
    if (item === null || typeof item !== 'object') return;

    if ('id' in item && typeof item.id === 'string') {
      addId(item.id);
    }
    if ('event_id' in item && typeof item.event_id === 'string') {
      addId(item.event_id);
    }

    // Some DVMs return tag tuples like ["e", "<id>", "<relay>"].
    if (Array.isArray(item)) {
      const tagName = String(item[0] ?? '');
      const tagValue = String(item[1] ?? '');
      if (tagName === 'e' && tagValue) addId(tagValue);
      if (tagName === 'a' && tagValue) parseAddressable(tagValue);
    }
  };

  for (const result of results) {
    // e/a tags directly on the result event itself.
    for (const tag of result.tags) {
      if (tag[0] === 'e' && tag[1]) addId(tag[1]);
      if (tag[0] === 'a' && tag[1]) parseAddressable(tag[1]);
    }

    if (!result.content) continue;

    // Case 1: valid JSON value.
    let parsed: unknown;
    let parsedOk = false;
    try {
      parsed = JSON.parse(result.content);
      parsedOk = true;
    } catch {
      // Case 2: the 5300 spec example omits outer brackets, e.g.
      // "["e","id","relay"],["e","id","relay"]". Wrap and try again.
      try {
        parsed = JSON.parse(`[${result.content}]`);
        parsedOk = true;
      } catch {
        // Ignore; fall through to text splitting.
      }
    }

    if (parsedOk) {
      if (Array.isArray(parsed)) {
        for (const item of parsed) parseItem(item);
      }
    } else {
      // Fall back to splitting on whitespace/newlines/commas.
      for (const token of result.content.split(/[\s,]+/)) {
        addId(token);
      }
    }
  }

  return { ids, addresses };
}

/** Fetch the events referenced by IDs and addressable coordinates. */
async function fetchReferencedEvents(
  nostr: DvmNostrPool,
  refs: DvmReferences,
  signal?: AbortSignal,
): Promise<NostrEvent[]> {
  const byId = new Map<string, NostrEvent>();

  if (refs.ids.length > 0) {
    const chunks = chunkArray(refs.ids, ID_CHUNK_SIZE);
    const fetched = await Promise.all(
      chunks.map((ids) => nostr.query([{ ids, limit: ids.length }], { signal })),
    );
    for (const ev of fetched.flat()) {
      byId.set(ev.id, ev);
    }
  }

  if (refs.addresses.length > 0) {
    const addrFilters: NostrFilter[] = refs.addresses.map(({ kind, pubkey, identifier }) => ({
      kinds: [kind],
      authors: [pubkey],
      '#d': [identifier],
      limit: 1,
    }));
    const fetched = await nostr.query(addrFilters, { signal });
    for (const ev of fetched) {
      byId.set(ev.id, ev);
    }
  }

  // Preserve DVM ordering (newest result first, then order within each result).
  const ordered: NostrEvent[] = [];
  const seen = new Set<string>();

  const add = (ev: NostrEvent | undefined) => {
    if (!ev || seen.has(ev.id)) return;
    seen.add(ev.id);
    ordered.push(ev);
  };

  // IDs are already in recommendation order across result events sorted newest first.
  for (const id of refs.ids) {
    add(byId.get(id));
  }

  for (const addr of refs.addresses) {
    for (const ev of byId.values()) {
      if (
        ev.kind === addr.kind &&
        ev.pubkey === addr.pubkey &&
        ev.tags.find(([t]) => t === 'd')?.[1] === addr.identifier
      ) {
        if (!seen.has(ev.id)) {
          add(ev);
        }
        break;
      }
    }
  }

  return ordered;
}

/** Parse a raw relay message tuple into an event. */
function parseEventMessage(msg: unknown): NostrEvent | undefined {
  if (!Array.isArray(msg) || msg.length < 3 || msg[0] !== 'EVENT') return undefined;
  const event = msg[2];
  if (
    event &&
    typeof event === 'object' &&
    typeof (event as Record<string, unknown>).id === 'string' &&
    typeof (event as Record<string, unknown>).pubkey === 'string' &&
    typeof (event as Record<string, unknown>).created_at === 'number' &&
    typeof (event as Record<string, unknown>).kind === 'number' &&
    Array.isArray((event as Record<string, unknown>).tags) &&
    typeof (event as Record<string, unknown>).content === 'string' &&
    typeof (event as Record<string, unknown>).sig === 'string'
  ) {
    return event as NostrEvent;
  }
  return undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Read the user's read relays from localStorage app config. */
function getReadRelays(): string[] {
  try {
    const raw = localStorage.getItem('nostr:app-config');
    if (!raw) return [];
    const config = JSON.parse(raw) as {
      relayMetadata?: { relays?: { url: string; read?: boolean; write?: boolean }[] };
    };
    return (config.relayMetadata?.relays ?? [])
      .filter((r) => r.read !== false)
      .map((r) => r.url)
      .slice(0, 5);
  } catch {
    return [];
  }
}
