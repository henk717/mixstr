/** CORS proxy configuration storage */

export interface CorsProxySettings {
  /** Primary CORS proxy URL template (use {url} as placeholder) */
  primary: string;
  /** Optional backup CORS proxy URL template */
  backup?: string;
}

export const DEFAULT_CORS_PROXY: CorsProxySettings = {
  primary: 'https://proxy.shakespeare.diy/?url=',
  backup: undefined,
};

const STORAGE_KEY = 'mixstr:cors-proxy';

function storageKey(pubkey?: string): string {
  return pubkey ? `${STORAGE_KEY}:${pubkey}` : STORAGE_KEY;
}

export function loadCorsProxy(pubkey?: string): CorsProxySettings {
  try {
    const raw = localStorage.getItem(storageKey(pubkey));
    if (!raw) return DEFAULT_CORS_PROXY;
    const parsed = JSON.parse(raw) as Partial<CorsProxySettings>;
    return mergeCorsProxy(parsed);
  } catch {
    return DEFAULT_CORS_PROXY;
  }
}

export function saveCorsProxy(settings: CorsProxySettings, pubkey?: string): void {
  try {
    localStorage.setItem(storageKey(pubkey), JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function mergeCorsProxy(partial: Partial<CorsProxySettings>): CorsProxySettings {
  return {
    primary: partial.primary ?? DEFAULT_CORS_PROXY.primary,
    backup: partial.backup ?? DEFAULT_CORS_PROXY.backup,
  };
}
