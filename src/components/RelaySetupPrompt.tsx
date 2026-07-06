import { useState } from 'react';
import { Plus, X, Check, Wifi, Shield, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { SUGGESTED_RELAYS } from '@/lib/appRelays';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Full-page prompt shown when no relays are configured yet.
 *
 * The user must explicitly add at least one relay before any Nostr queries
 * are made. This prevents automatic relay connections without user consent.
 *
 * If the user logs in via NIP-07 extension, NostrSync will automatically
 * import their relay list and this screen dismisses itself.
 */
export function RelaySetupPrompt() {
  const { updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const [customRelays, setCustomRelays] = useState<string[]>([]);

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

        <div>
          <h1 className="text-2xl font-bold text-foreground">Choose your relays</h1>
          <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
            Mixstr connects only to relays you choose. We never connect anywhere automatically —
            you're in full control of your data flow.
          </p>
        </div>

        {/* Privacy note */}
        <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
          <Shield size={16} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">No automatic connections.</span>{' '}
            Relays you add here will be the only servers this client communicates with.
            You can change them at any time in <strong>Settings → Relays</strong>.
          </p>
        </div>

        {/* Login option */}
        {!user && (
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Wifi size={15} className="text-primary" />
              Log in to import your relay list
            </p>
            <p className="text-xs text-muted-foreground">
              If you use a NIP-07 browser extension (Alby, nos2x, etc.), signing in will
              automatically import your existing relay list — no manual selection needed.
            </p>
            <LoginArea className="max-w-64" />
          </div>
        )}

        {/* Suggested relays */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Suggested public relays</p>
          <p className="text-xs text-muted-foreground">
            Select one or more. These are well-known community relays — you're not required to use any of them.
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
  );
}
