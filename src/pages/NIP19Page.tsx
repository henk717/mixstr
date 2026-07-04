import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NotFound from './NotFound';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProfilePage } from './ProfilePage';
import { EventDetailPage } from './EventDetailPage';

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

    case 'note': {
      return (
        <MainLayout>
          <EventDetailPage eventId={decoded.data} />
        </MainLayout>
      );
    }

    case 'nevent': {
      return (
        <MainLayout>
          <EventDetailPage
            eventId={decoded.data.id}
            pubkey={decoded.data.author}
          />
        </MainLayout>
      );
    }

    case 'naddr': {
      // Addressable events (articles etc.) — navigate to event detail
      return (
        <MainLayout>
          <EventDetailPage
            eventId={decoded.data.identifier}
            pubkey={decoded.data.pubkey}
          />
        </MainLayout>
      );
    }

    default:
      return <NotFound />;
  }
}
