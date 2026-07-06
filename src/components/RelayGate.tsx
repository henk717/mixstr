import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
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
  const { config, isSyncingRelays } = useAppContext();
  const { logins } = useNostrLogin();

  const hasRelays = config.relayMetadata.relays.length > 0;
  const hasLogin = logins.length > 0;

  // If there's a login but no relays yet, NostrSync is trying to pull the
  // NIP-65 list. Show a loading overlay while syncing.
  if (!hasRelays && hasLogin) {
    return (
      <>
        {children}
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-popover border border-border rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4 text-center space-y-4">
            <div className="flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Syncing relays</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isSyncingRelays 
                  ? 'Fetching your relay list from Nostr…' 
                  : 'Setting up your connections…'}
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!hasRelays) {
    return <RelaySetupPrompt />;
  }

  return <>{children}</>;
}
