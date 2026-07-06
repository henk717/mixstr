import { useState, useEffect } from 'react';
import { Plus, X, Check, Wifi, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { SUGGESTED_RELAYS, DEFAULT_RELAYS } from '@/lib/appRelays';

/**
 * Full-page prompt shown when no relays are configured yet.
 *
 * Flow:
 * 1. Automatically attempt NIP-07 extension authorization on mount
 * 2. If granted, NostrSync imports relays and this screen dismisses
 * 3. If not granted or missing extension, show relay selection page
 * 4. Provide "Pick for me" button for default relay selection
 */
export function RelaySetupPrompt() {
  const { updateConfig } = useAppContext();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const [customRelays, setCustomRelays] = useState<string[]>([]);
  const [showRelaySelection, setShowRelaySelection] = useState(false);
  const [extensionChecked, setExtensionChecked] = useState(false);

  // Automatically attempt NIP-07 extension authorization on mount
  useEffect(() => {
    const checkExtension = async () => {
      if (typeof window === 'undefined' || !('nostr' in window)) {
        setShowRelaySelection(true);
        setExtensionChecked(true);
        return;
      }

      try {
        const provider = (window as { nostr?: { getPublicKey: () => Promise<string> } }).nostr;
        if (!provider?.getPublicKey) {
          setShowRelaySelection(true);
          setExtensionChecked(true);
          return;
        }

        // Attempt to get public key from extension
        const pubkey = await provider.getPublicKey();
        if (pubkey) {
          // Extension granted access - NostrSync will import relays automatically
          // Keep this screen visible until NostrSync populates relays
          setExtensionChecked(true);
          return;
        }
      } catch {
        // Extension declined or errored
      }

      // Fall back to relay selection
      setShowRelaySelection(true);
      setExtensionChecked(true);
    };

    checkExtension();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSuggested = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const addCustom = () => {
    const url = customInput.trim();
    if (!url) return;
    const normalized = url.startsWith('wss://') || url.startsWith('ws://')
      ? url
      : `wss://${url}`;
    if (!customRelays.includes(normalized)) {
      setCustomRelays((prev) => [...prev, normalized]);
      setSelected((prev) => new Set([...prev, normalized]));
    }
    setCustomInput('');
  };

  const removeCustom = (url: string) => {
    setCustomRelays((prev) => prev.filter((r) => r !== url));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  };

  /** Apply default relay selection */
  const handlePickForMe = () => {
    const defaultUrls = DEFAULT_RELAYS.map((r) => r.url);
    setSelected(new Set(defaultUrls));
    setCustomRelays(defaultUrls);
  };

  const handleConnect = () => {
    if (selected.size === 0) return;
    const relays = [...selected].map((url) => ({ url, read: true, write: true }));
    updateConfig((current) => ({
      ...current,
      relayMetadata: { relays, updatedAt: Math.floor(Date.now() / 1000) },
    }));
  };

  return (
    <div className="min-h-screen bg-background flex items-start justify-center pt-12 pb-12 px-4">
      <div className="w-full max-w-lg space-y-6">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-md shadow-primary/30">
            <span className="text-primary-foreground font-black text-sm">M</span>
          </div>
          <span className="font-black text-2xl tracking-tight text-foreground">
            Mix<span className="text-primary">str</span>
          </span>
        </div>

        {/* Relay Selection Page */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Choose your relays</h1>
            <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
              Mixstr is a viewer — we do not host any content. Please pick a few relays to load from,
              or click the "Pick for me" button for a recommended selection.
            </p>
          </div>

          {/* Privacy note */}
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
            <Shield size={16} className="text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">You're in control.</span>{' '}
              Relays you select will be the only servers this client communicates with.
              You can change them at any time in <strong>Settings → Relays</strong>.
            </p>
          </div>

          {/* Pick for me button */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Wifi size={15} className="text-primary" />
              Not sure what to pick?
            </p>
            <p className="text-xs text-muted-foreground">
              Our recommended relay selection will give you access to the Nostr social network
              with a balanced mix of performance and decentralization.
            </p>
            <Button
              onClick={handlePickForMe}
              variant="secondary"
              className="w-full h-10 text-sm"
            >
              <Wifi size={14} className="mr-2" />
              Pick for me
            </Button>
          </div>

          {/* Suggested relays */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Suggested public relays</p>
            <p className="text-xs text-muted-foreground">
              Select one or more. These are well-known community relays.
            </p>
            <div className="space-y-1.5">
              {SUGGESTED_RELAYS.map(({ url, description }) => {
                const isOn = selected.has(url);
                return (
                  <button
                    key={url}
                    onClick={() => toggleSuggested(url)}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 text-left px-3 py-2.5 rounded-xl border text-sm transition-all',
                      isOn
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-card hover:bg-accent text-foreground',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium truncate">{url}</p>
                      <p className="text-[11px] text-muted-foreground">{description}</p>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                        isOn ? 'border-primary bg-primary' : 'border-border',
                      )}
                    >
                      {isOn && <Check size={11} className="text-primary-foreground" strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom relay input */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Add a custom relay</p>
            <div className="flex gap-2">
              <Input
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustom()}
                placeholder="wss://relay.example.com"
                className="font-mono text-sm h-9"
              />
              <Button size="sm" variant="outline" onClick={addCustom} className="h-9 flex-shrink-0">
                <Plus size={15} />
                Add
              </Button>
            </div>

            {customRelays.length > 0 && (
              <div className="space-y-1.5">
                {customRelays.map((url) => (
                  <div
                    key={url}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-sm"
                  >
                    <p className="font-mono text-xs flex-1 truncate text-foreground">{url}</p>
                    <button
                      onClick={() => removeCustom(url)}
                      className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Connect button */}
          <Button
            onClick={handleConnect}
            disabled={selected.size === 0}
            className="w-full h-11 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <Wifi size={16} className="mr-2" />
            Connect to {selected.size > 0 ? `${selected.size} relay${selected.size > 1 ? 's' : ''}` : 'relays'}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            You can add, remove, or change relays at any time in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
