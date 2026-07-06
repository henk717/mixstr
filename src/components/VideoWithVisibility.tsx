import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface VideoWithVisibilityProps {
  src: string;
  className?: string;
  poster?: string;
}

/**
 * Video component that only loads and initializes when visible in viewport.
 * Prevents off-screen videos from consuming resources and ensures proper
 * initialization when they scroll into view.
 */
export function VideoWithVisibility({ src, className, poster }: VideoWithVisibilityProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      {
        rootMargin: '200px',
        threshold: 0.1,
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible]);

  const handleLoadedMetadata = () => {
    setIsLoaded(true);
  };

  return (
    <div ref={containerRef} className="w-full">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        preload={isVisible ? 'metadata' : 'none'}
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        className={cn(
          'w-full max-h-96 object-contain bg-black transition-opacity duration-300',
          !isLoaded && 'opacity-50',
          className,
        )}
      />
    </div>
  );
}