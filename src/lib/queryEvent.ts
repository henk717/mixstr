import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';

export interface FetchEventOptions {
  /** Relay URLs known to have the target event. Queried directly in parallel with the pool. */
  relayHints?: string[];
  /** Total timeout for the whole fetch race. */
  timeoutMs?: number;
  /** AbortSignal from the caller (e.g. TanStack Query). */
  signal?: AbortSignal;
}

function isValidRelayUrl(url: string): boolean {
  return typeof url === 'string' && (url.startsWith('wss://') || url.startsWith('ws://'));
}

/**
 * Query `nostr` for a single event, racing the default pool against any
 * provided relay hints.
 *
 * Why this matters: an event may live on a relay that isn't in the user's
 * normal pool, on a slow relay where the pool-level EOSE timeout gives up
 * too early, or only on a relay named in a NIP-19 / tag hint. By querying
 * those hints directly and racing them against the pool, we reliably load
 * events that would otherwise appear blank.
 */
export async function fetchEventWithRelays(
  nostr: NPool,
  filter: NostrFilter[],
  options: FetchEventOptions = {},
): Promise<NostrEvent | undefined> {
  const relayHints = [...new Set((options.relayHints ?? []).filter(isValidRelayUrl))];
  const timeoutMs = options.timeoutMs ?? 6000;

  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  const queryPool = nostr
    .query(filter, { signal })
    .then(([ev]) => ev as NostrEvent | undefined)
    .catch(() => undefined);

  const queryHints = relayHints.map(async (url) => {
    try {
      const relay = nostr.relay(url);
      const [ev] = await relay.query(filter, { signal });
      return ev as NostrEvent | undefined;
    } catch {
      return undefined;
    }
  });

  const tasks = [queryPool, ...queryHints];

  return new Promise<NostrEvent | undefined>((resolve) => {
    let pending = tasks.length;
    if (pending === 0) {
      clearTimeout(timer);
      resolve(undefined);
      return;
    }

    const finish = () => {
      if (pending < 0) return;
      pending = -1;
      clearTimeout(timer);
      resolve(undefined);
    };

    const tryResolve = (ev: NostrEvent | undefined) => {
      if (pending < 0) return;
      if (ev) {
        pending = -1;
        clearTimeout(timer);
        resolve(ev);
      }
    };

    for (const task of tasks) {
      task.then(tryResolve, () => undefined).finally(() => {
        if (pending > 0) {
          pending--;
          if (pending === 0) finish();
        }
      });
    }

    signal.addEventListener('abort', finish, { once: true });
  });
}
