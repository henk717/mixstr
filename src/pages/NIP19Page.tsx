import { nip19 } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NotFound from './NotFound';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProfilePage } from './ProfilePage';
import { EventDetailPage } from './EventDetailPage';
import { LivestreamDetailPage } from './LivestreamDetailPage';

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
      const { kind, pubkey, identifier: dTag } = decoded.data;
      // Kind 30311 = NIP-53 livestream — dedicated page with player + live chat
      if (kind === 30311) {
        return (
          <MainLayout>
            <LivestreamDetailPage pubkey={pubkey} dTag={dTag} />
          </MainLayout>
        );
      }
      // All other addressable events (articles, etc.)
      return (
        <MainLayout>
          <EventDetailPage
            eventId={dTag}
            pubkey={pubkey}
            kind={kind}
          />
        </MainLayout>
      );
    }

    default:
      return <NotFound />;
  }
}
