import { type ReactNode } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { useNostrLogin } from '@nostrify/react/login';
import { RelaySetupPrompt } from './RelaySetupPrompt';

/**
 * Gate that shows the relay setup screen when no relays are configured.
 *
 * We skip the gate if:
 *  - At least one relay is configured (either manually or synced from NIP-65)
 *  - The user has a login session (extension/nsec/bunker) — in that case
 *    NostrSync will fetch their relay list from bootstrap relays first; we
 *    let the sync run and the gate will clear once relays are populated.
 *
 * The gate is intentionally NOT skipped for logged-out users with no relays —
 * we don't want to make any relay connections without explicit user consent.
 */
export function RelayGate({ children }: { children: ReactNode }) {
  const { config } = useAppContext();
  const { logins } = useNostrLogin();

  const hasRelays = config.relayMetadata.relays.length > 0;
  const hasLogin = logins.length > 0;

  // If there's a login but no relays yet, NostrSync is trying to pull the
  // NIP-65 list. Show a thin loading indicator rather than the full setup
  // prompt — it should resolve quickly.
  if (!hasRelays && hasLogin) {
    return (
      <>
        {children}
        {/* NostrSync will populate relays; nothing to block here */}
      </>
    );
  }

  if (!hasRelays) {
    return <RelaySetupPrompt />;
  }

  return <>{children}</>;
}
