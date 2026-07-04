import { useSeoMeta } from '@unhead/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginArea } from '@/components/auth/LoginArea';
import { Mail, Lock, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Encrypted DMs using NIP-17 (gift-wrapped kind 14 via kind 1059).
 *
 * Full NIP-17 requires:
 * 1. Fetching kind 1059 gift-wraps addressed to the user's pubkey
 * 2. Decrypting the outer wrap with a random key (via signer)
 * 3. Decrypting the inner seal (kind 13) to get the rumor (kind 14)
 *
 * This is a stub that shows the architecture — full threading
 * will be added in a later iteration.
 */
export function MessagesPage() {
  useSeoMeta({ title: 'Messages · Mixstr' });
  const { user } = useCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <Mail size={40} className="text-muted-foreground" />
        <p className="text-muted-foreground">Log in to read your encrypted messages.</p>
        <LoginArea className="max-w-64" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
        <div className="px-4 py-4 flex items-center gap-2">
          <Mail size={20} className="text-primary" />
          <h1 className="text-lg font-bold">Messages</h1>
          <Lock size={14} className="text-green-500 ml-1" title="End-to-end encrypted" />
        </div>
      </div>

      {/* Encryption info card */}
      <Card className="mx-4 my-4 border-primary/20 bg-primary/5">
        <CardContent className="py-3 px-4 flex items-start gap-3">
          <Lock size={16} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">End-to-end encrypted via NIP-17</p>
            <p>
              Messages use NIP-44 encryption wrapped in gift wraps (kind 1059) so
              no metadata leaks to relays. Only you can read your messages.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed mx-4 my-4">
        <CardContent className="py-12 px-8 text-center space-y-3">
          <Mail size={32} className="text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Encrypted direct messages are coming soon. This will support NIP-17 gift-wrapped messages with full metadata privacy.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Info size={12} />
            Messages will only be visible to you
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
