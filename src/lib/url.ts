/**
 * Build an absolute URL for a client-side route.
 *
 * The app uses React Router's HashRouter, so route paths are kept in the
 * URL fragment. Direct links shared outside the app (copy-to-clipboard,
 * third-party callbacks, etc.) must include `/#` or they will hit the host
 * as real paths and return 404s on static hosts like Cloudflare Pages.
 */
export function createShareUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${window.location.origin}/#${normalized}`;
}
