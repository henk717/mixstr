import { useQuery } from '@tanstack/react-query';

/**
 * Verifies a NIP-05 identifier against the `.well-known/nostr.json` endpoint.
 *
 * Returns:
 *  - `{ verified: true }` when the identifier resolves to `pubkey`
 *  - `{ verified: false }` when verification fails or the identifier is missing
 */
export function useNip05Verification(nip05: string | undefined, pubkey: string) {
  return useQuery<boolean>({
    queryKey: ['nip05', nip05 ?? '', pubkey],
    queryFn: async ({ signal }) => {
      if (!nip05) return false;

      // NIP-05 format: name@domain (bare domain → _@domain)
      const [namePart, domain] = nip05.includes('@')
        ? nip05.split('@', 2)
        : ['_', nip05];

      if (!domain) return false;

      const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(namePart)}`;

      try {
        const response = await fetch(url, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          headers: { Accept: 'application/json' },
          // credentials: 'omit' to avoid CORS preflight issues
          credentials: 'omit',
          mode: 'cors',
        });

        if (!response.ok) return false;

        const data = (await response.json()) as { names?: Record<string, string> };
        const resolvedPubkey = data.names?.[namePart];

        return resolvedPubkey === pubkey;
      } catch {
        return false;
      }
    },
    enabled: !!nip05 && !!pubkey,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    gcTime: 30 * 60 * 1000,
  });
}
