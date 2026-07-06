import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * The app ships with NO default relays.
 *
 * We intentionally do not connect to any relay without explicit user consent.
 * This protects the operator from liability for content hosted on external
 * relays appearing to be associated with this service.
 *
 * Relay configuration happens via:
 *  1. NIP-07 browser extension (relays fetched automatically on login)
 *  2. NIP-65 kind 10002 event from the user's existing relay list
 *  3. Manual entry on the relay setup screen (shown when list is empty)
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [],
  updatedAt: 0,
};

/**
 * Well-known public relays shown as suggestions in the relay setup UI.
 * The user must explicitly choose at least one — nothing connects automatically.
 */
export const SUGGESTED_RELAYS: { url: string; description: string }[] = [
  { url: 'wss://relay.ditto.pub', description: 'Ditto — general purpose' },
  { url: 'wss://relay.primal.net', description: 'Primal — high-speed cache' },
  { url: 'wss://relay.damus.io', description: 'Damus — popular iOS client relay' },
  { url: 'wss://relay.nostr.band', description: 'nostr.band — search relay' },
  { url: 'wss://nos.lol', description: 'nos.lol — community relay' },
  { url: 'wss://nostr.wine', description: 'nostr.wine — premium relay' },
  { url: 'wss://purplepag.es', description: 'purplepag.es — profile relay' },
];

/**
 * Default relay selection used when user clicks "Pick for me".
 * This can be configured separately from suggested relays.
 * For now, it's identical to SUGGESTED_RELAYS, but can be customized.
 */
export const DEFAULT_RELAYS: { url: string; description: string }[] = [
  { url: 'wss://relay.ditto.pub', description: 'Ditto — general purpose' },
  { url: 'wss://relay.primal.net', description: 'Primal — high-speed cache' },
  { url: 'wss://relay.damus.io', description: 'Damus — popular iOS client relay' },
];
