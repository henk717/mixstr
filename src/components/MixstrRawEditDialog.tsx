import { useState, useEffect, useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, Trash2, Save, Download, AlertCircle } from 'lucide-react';
import type { MixstrConfig } from '@/hooks/useMixstrBackup';

const D_TAG = 'mixstr-config-v1';

export function MixstrRawEditDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending: isPublishing } = useNostrPublish();
  const { toast } = useToast();
  
  const [jsonContent, setJsonContent] = useState<string>('');
  const [editedContent, setEditedContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRemoteBackup, setHasRemoteBackup] = useState(false);

  // Fetch the encrypted event from Nostr and decrypt it
  const fetchRemoteConfig = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const [event] = await nostr.query(
        [{ kinds: [30078], authors: [user.pubkey], '#d': [D_TAG], limit: 1 }],
        { signal: AbortSignal.timeout(8000) },
      );

      if (!event || !event.content) {
        setJsonContent('');
        setEditedContent('');
        setHasRemoteBackup(false);
        toast({
          title: 'No backup found',
          description: 'No NIP-78 backup event found on your relays.',
          variant: 'default',
        });
        return;
      }

      setHasRemoteBackup(true);

      // Try to decrypt
      if (user.signer.nip44) {
        try {
          const plaintext = await user.signer.nip44.decrypt(user.pubkey, event.content);
          const parsed = JSON.parse(plaintext) as MixstrConfig;
          const formatted = JSON.stringify(parsed, null, 2);
          setJsonContent(formatted);
          setEditedContent(formatted);
        } catch (decryptErr) {
          setError(`Decryption failed: ${(decryptErr as Error).message}`);
          toast({
            title: 'Decryption failed',
            description: (decryptErr as Error).message,
            variant: 'destructive',
          });
        }
      } else {
        setError('NIP-44 not supported by current signer');
        toast({
          title: 'NIP-44 not supported',
          description: 'Your signer does not support NIP-44 encryption.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      setError((err as Error).message);
      toast({
        title: 'Failed to fetch backup',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, nostr, toast]);

  // Fetch when dialog opens
  useEffect(() => {
    if (open) {
      fetchRemoteConfig();
    }
  }, [open, fetchRemoteConfig]);

  const handleSave = async () => {
    if (!user) {
      toast({ title: 'Not logged in', variant: 'destructive' });
      return;
    }

    if (!user.signer.nip44) {
      toast({ title: 'NIP-44 not supported', description: 'Your signer does not support NIP-44 encryption.', variant: 'destructive' });
      return;
    }

    try {
      // Validate JSON
      const parsed = JSON.parse(editedContent) as MixstrConfig;
      
      // Encrypt the edited content
      const plaintext = JSON.stringify(parsed);
      const ciphertext = await user.signer.nip44.encrypt(user.pubkey, plaintext);

      await publish({
        kind: 30078,
        content: ciphertext,
        tags: [
          ['d', D_TAG],
          ['alt', 'Mixstr app configuration (encrypted)'],
        ],
      });

      toast({
        title: 'Backup updated',
        description: 'Your raw backup has been saved to Nostr.',
      });

      // Refresh the data
      setJsonContent(editedContent);
      await fetchRemoteConfig();
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!user) {
      toast({ title: 'Not logged in', variant: 'destructive' });
      return;
    }

    if (!user.signer.nip44) {
      toast({ title: 'NIP-44 not supported', description: 'Your signer does not support NIP-44 encryption.', variant: 'destructive' });
      return;
    }

    if (!confirm('Delete backup from relays? This will remove your NIP-78 encrypted backup event. Local settings will remain.')) {
      return;
    }

    try {
      // Publish empty content to signal deletion
      const ciphertext = await user.signer.nip44.encrypt(user.pubkey, '');

      await publish({
        kind: 30078,
        content: ciphertext,
        tags: [
          ['d', D_TAG],
          ['alt', 'Mixstr app configuration (encrypted)'],
        ],
      });

      toast({
        title: 'Backup deleted',
        description: 'Your remote backup has been deleted from relays.',
      });

      setJsonContent('');
      setEditedContent('');
      setHasRemoteBackup(false);
    } catch (err) {
      toast({
        title: 'Failed to delete',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const downloadBackup = () => {
    if (!jsonContent) return;
    
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mixstr-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const hasChanges = jsonContent !== editedContent;

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mixstr Raw Edit</DialogTitle>
            <DialogDescription>Sign in to access your backup.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="flex items-center gap-2">
                Mixstr Raw Edit
                <Badge variant="secondary" className="text-xs">Debug</Badge>
              </DialogTitle>
              <DialogDescription className="mt-2">
                Edit your NIP-78 backup JSON directly. Changes are encrypted and saved to kind 30078.
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRemoteConfig}
              disabled={isLoading}
              className="h-8 shrink-0"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin mr-1.5' : 'mr-1.5'} />
              Refresh
            </Button>
          </div>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle size={16} className="mr-2 shrink-0" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!hasRemoteBackup && !isLoading && (
          <Alert className="mt-4">
            <AlertDescription className="text-sm">
              No backup found on your relays. Your local settings will be used as the starting point.
            </AlertDescription>
          </Alert>
        )}

        {/* JSON Editor */}
        <div className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Backup JSON</Label>
            <div className="flex gap-2">
              {jsonContent && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={downloadBackup}
                    className="h-7 text-xs"
                  >
                    <Download size={12} className="mr-1" />
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(editedContent)}
                    className="h-7 text-xs"
                  >
                    Copy
                  </Button>
                </>
              )}
            </div>
          </div>
          
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            placeholder={isLoading ? 'Loading backup...' : 'Edit your backup JSON here...'}
            className="font-mono text-sm min-h-[400px] resize-none"
            disabled={isLoading}
          />
          
          <p className="text-[11px] text-muted-foreground">
            Contains: sidebarLists, feedViewModes, spamSettings, lastNotificationReadAt, savedAt
          </p>
        </div>

        <DialogFooter className="mt-6 gap-2 flex-wrap pt-4 border-t border-border">
          <Button
            onClick={handleSave}
            disabled={!editedContent.trim() || isLoading || isPublishing || !hasChanges}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Save size={14} className="mr-2" />
            Save to Nostr
          </Button>
          
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={!hasRemoteBackup || isLoading || isPublishing}
            className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
          >
            <Trash2 size={14} className="mr-2" />
            Delete Remote Backup
          </Button>
        </DialogFooter>

        <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground leading-relaxed">
          <p>
            This backup is stored as a NIP-78 parameterized replaceable event (kind 30078, d-tag: "{D_TAG}").
            It is encrypted using NIP-44 to your public key before being published to your relays.
            Only you can decrypt and read its contents.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}