import { ReactNode } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { AudioPlayerBar } from '../audio/AudioPlayerBar';
import { useMixstr } from '@/hooks/useMixstr';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { currentTrack } = useMixstr();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left Sidebar */}
      <LeftSidebar />

      {/* Main content area — scrollable column */}
      <main
        className="flex-1 min-w-0 overflow-y-auto"
        style={{ paddingBottom: currentTrack ? '88px' : '0' }}
      >
        {children}
      </main>

      {/* Audio player bar - fixed at bottom */}
      {currentTrack && <AudioPlayerBar />}
    </div>
  );
}
