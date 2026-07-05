/**
 * Deterministic 8-character hex hash for a string.
 * Used for stable synthetic ids when an event id must be derived from content.
 */
export function stableIdFromString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Deterministic 64-character hex string for a string.
 * Useful for synthetic Nostr event ids / pubkeys that must satisfy length checks
 * but do not need to be cryptographically valid.
 */
export function stableHex64(s: string): string {
  return stableIdFromString(s).repeat(8);
}
