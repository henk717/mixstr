import type { NostrEvent } from '@nostrify/nostrify';

export interface SpamSettings {
  webOfTrust: {
    enabled: boolean;
    /** How far back to look for network reports/follows, in days */
    windowDays: number;
  };
  hashtag: {
    enabled: boolean;
    /** Hide posts with more than this many hashtag tags */
    maxTags: number;
  };
  speed: {
    enabled: boolean;
    /** Max events allowed within the look-back window */
    maxEvents: number;
    /** Rolling window for the speed filter, in minutes */
    windowMinutes: number;
  };
  readability: {
    enabled: boolean;
    /** Minimum length to treat a single token as base64 spam */
    minBase64Length: number;
  };
}

export const DEFAULT_SPAM_SETTINGS: SpamSettings = {
  webOfTrust: { enabled: false, windowDays: 30 },
  hashtag: { enabled: false, maxTags: 10 },
  speed: { enabled: false, maxEvents: 10, windowMinutes: 5 },
  readability: { enabled: false, minBase64Length: 80 },
};

const STORAGE_KEY = 'mixstr:spam-settings';

function storageKey(pubkey?: string): string {
  return pubkey ? `${STORAGE_KEY}:${pubkey}` : STORAGE_KEY;
}

export function loadSpamSettings(pubkey?: string): SpamSettings {
  try {
    const raw = localStorage.getItem(storageKey(pubkey));
    if (!raw) return DEFAULT_SPAM_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SpamSettings>;
    return mergeSpamSettings(parsed);
  } catch {
    return DEFAULT_SPAM_SETTINGS;
  }
}

export function saveSpamSettings(settings: SpamSettings, pubkey?: string): void {
  try {
    localStorage.setItem(storageKey(pubkey), JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function mergeSpamSettings(partial: Partial<SpamSettings>): SpamSettings {
  return {
    webOfTrust: { ...DEFAULT_SPAM_SETTINGS.webOfTrust, ...partial.webOfTrust },
    hashtag: { ...DEFAULT_SPAM_SETTINGS.hashtag, ...partial.hashtag },
    speed: { ...DEFAULT_SPAM_SETTINGS.speed, ...partial.speed },
    readability: { ...DEFAULT_SPAM_SETTINGS.readability, ...partial.readability },
  };
}

/** Kinds whose content is expected to be structured/empty and should never be readability-filtered. */
export const READABILITY_EXEMPT_KINDS = new Set<number>([
  0, // metadata
  3, // contacts
  6, // repost
  16, // generic repost
  20, // picture first-class
  1063, // file metadata
  30023, // long-form article
  30078, // app-specific data
  30311, // live stream
  31337, // audio track
  34235, // video event
  34236, // audio event (video wrapper)
  34550, // community definition
  31922, // calendar event
  31923, // calendar event rsvp
  30315, // status
]);

export function isReadabilityExempt(event: NostrEvent): boolean {
  if (READABILITY_EXEMPT_KINDS.has(event.kind)) return true;
  // Trust explicit human-readable metadata tags
  if (event.tags.some(([t]) => t === 'title' || t === 'subject' || t === 'summary')) return true;
  return false;
}

export function looksLikeJson(content: string): boolean {
  const trimmed = content.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
  if (content.length > 100_000) return false;
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

export function looksLikeBase64(content: string, minLength: number): boolean {
  if (content.length < minLength) return false;
  if (/\s/.test(content)) return false;
  if (content.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return false;
  return true;
}

export function countHashtags(event: NostrEvent): number {
  return event.tags.filter(([t]) => t === 't').length;
}

/**
 * Returns true if the content appears to be machine-generated garbage rather
 * than human-readable text. Known structured/non-text kinds are exempted via
 * {@link isReadabilityExempt} before calling this.
 */
export function isNonHumanReadable(content: string, minBase64Length: number): boolean {
  if (looksLikeJson(content)) return true;
  if (looksLikeBase64(content, minBase64Length)) return true;
  return false;
}
