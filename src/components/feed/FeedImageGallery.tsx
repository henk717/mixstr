import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Lightbox } from '@/components/ImageGallery';
import { useBlossomFallback } from '@/hooks/useBlossomFallback';

interface FeedImageGalleryProps {
  images: string[];
  maxVisible?: number;
  className?: string;
  /** When true, the grid will auto-size to fit all visible images without a max height constraint. */
  autoSize?: boolean;
}

/**
 * Feed image grid used in list-view post cards.
 *
 * Renders up to `maxVisible` thumbnails in a tight grid and opens a
 * full-screen lightbox when a thumbnail is clicked. Arrow keys and
 * on-screen buttons let the viewer step through all attached images.
 */
export function FeedImageGallery({ images, maxVisible = 4, className, autoSize = false }: FeedImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const shown = useMemo(() => images.slice(0, maxVisible), [images, maxVisible]);
  const extra = Math.max(0, images.length - maxVisible);
  const gridCols = shown.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  
  // Calculate rows needed for the grid
  const rows = Math.ceil(shown.length / 2);
  // Each row is approximately 90px (smaller thumbnails for feed view) + 4px gap
  const estimatedRowHeight = 94;
  const calculatedHeight = rows * estimatedRowHeight;

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goNext = useCallback(
    () => setLightboxIndex((p) => (p !== null ? (p + 1) % images.length : null)),
    [images.length],
  );

  const goPrev = useCallback(
    () => setLightboxIndex((p) => (p !== null ? (p - 1 + images.length) % images.length : null)),
    [images.length],
  );

  if (shown.length === 0) return null;

  return (
    <>
      <div
        className={cn('grid gap-1 rounded-xl overflow-hidden', gridCols, className)}
        style={autoSize ? { height: calculatedHeight } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {shown.map((url, idx) => (
          <ImageThumbnail
            key={`${url}-${idx}`}
            url={url}
            index={idx}
            showOverlay={idx === maxVisible - 1 && extra > 0}
            extra={extra}
            onOpen={() => openLightbox(idx)}
          />
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={images.length > 1 ? goNext : undefined}
          onPrev={images.length > 1 ? goPrev : undefined}
        />
      )}
    </>
  );
}

interface ImageThumbnailProps {
  url: string;
  index: number;
  showOverlay: boolean;
  extra: number;
  onOpen: () => void;
}

function ImageThumbnail({ url, showOverlay, extra, onOpen }: ImageThumbnailProps) {
  const { src, onError } = useBlossomFallback(url);

  return (
    <button
      type="button"
      className="relative block overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label="View image"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        className="block w-full h-full object-cover aspect-video hover:opacity-90 transition-opacity"
        onError={onError}
      />
      {showOverlay && (
        <div className="absolute inset-0 bg-black/50 text-white flex items-center justify-center text-xl font-semibold">
          +{extra}
        </div>
      )}
    </button>
  );
}
