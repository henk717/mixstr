import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NotFound from './NotFound';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProfilePage } from './ProfilePage';

export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();

  if (!identifier) {
    return <NotFound />;
  }

  let decoded;
  try {
    decoded = nip19.decode(identifier);
  } catch {
    return <NotFound />;
  }

  const { type } = decoded;

  switch (type) {
    case 'npub':
    case 'nprofile': {
      const pubkey = type === 'npub' ? decoded.data : decoded.data.pubkey;
      return (
        <MainLayout>
          <ProfilePage pubkey={pubkey} />
        </MainLayout>
      );
    }

    case 'note':
    case 'nevent':
    case 'naddr':
      // TODO: implement event/article views
      return (
        <MainLayout>
          <div className="max-w-2xl mx-auto px-4 py-8 text-muted-foreground text-center">
            Event view coming soon.
          </div>
        </MainLayout>
      );

    default:
      return <NotFound />;
  }
}
