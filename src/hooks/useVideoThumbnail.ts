import { useEffect, useState } from 'react';

interface VideoThumbnailState {
  /** Extracted frame as a JPEG data URL, if successful. */
  dataUrl: string | undefined;
  /** True while metadata is loading or the frame is being captured. */
  loading: boolean;
  /** Error object if the video could not be loaded or the frame could not be captured. */
  error: Error | undefined;
}

interface CacheEntry {
  dataUrl?: string;
  error?: Error;
}

const cache = new Map<string, CacheEntry>();

/** Maximum width/height for the generated JPEG to keep memory and data-URL size small. */
const MAX_THUMB_WIDTH = 640;
const MAX_THUMB_HEIGHT = 360;
/** JPEG quality for the generated data URL. */
const JPEG_QUALITY = 0.85;
/** Timeout before giving up on a thumbnail, in milliseconds. */
const CAPTURE_TIMEOUT_MS = 15000;

class ThumbnailAbortError extends Error {
  constructor(message = 'Cancelled') {
    super(message);
    this.name = 'ThumbnailAbortError';
  }
}

function getSeekTime(duration: number): number {
  if (!isFinite(duration) || duration <= 0) return 0.5;
  // Prefer the 20% mark for short clips, but never seek far enough that the
  // browser needs to fetch a large amount of data. For longer videos we fall
  // back to an early frame so the preview stays small.
  return Math.min(duration * 0.2, 2);
}

async function captureFrame(videoUrl: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ThumbnailAbortError());
      return;
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Thumbnail capture timed out'));
    }, CAPTURE_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const onAbort = () => {
      cleanup();
      reject(new ThumbnailAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });

    const handleLoadedMetadata = () => {
      try {
        video.currentTime = getSeekTime(video.duration);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const handleSeeked = () => {
      try {
        const srcWidth = video.videoWidth || MAX_THUMB_WIDTH;
        const srcHeight = video.videoHeight || MAX_THUMB_HEIGHT;
        const scale = Math.min(
          MAX_THUMB_WIDTH / Math.max(srcWidth, 1),
          MAX_THUMB_HEIGHT / Math.max(srcHeight, 1),
          1,
        );

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(srcWidth * scale);
        canvas.height = Math.round(srcHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Could not get canvas 2D context'));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const handleError = () => {
      cleanup();
      const message = video.error?.message ?? 'Unknown video load error';
      reject(new Error(`Video load failed: ${message}`));
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

/**
 * Extract a thumbnail frame from a direct video URL using only the browser's
 * built-in `<video>` element. The video is loaded with `preload="metadata"`,
 * seeked to an early timestamp (short clips use the 20% mark; longer clips are
 * capped to a few seconds), and one frame is drawn to a canvas.
 *
 * Successfully extracted frames are cached per URL, so once a frame is decoded
 * it can be reused by any card without downloading the video again.
 *
 * Note: frame extraction requires the video host to allow CORS. If the host does
 * not send an `Access-Control-Allow-Origin` header, capture fails and the caller
 * should fall back to a generic placeholder.
 */
export function useVideoThumbnail(videoUrl: string | undefined): VideoThumbnailState {
  const [state, setState] = useState<VideoThumbnailState>(() => {
    if (!videoUrl) return { dataUrl: undefined, loading: false, error: undefined };
    const cached = cache.get(videoUrl);
    if (cached?.dataUrl) return { dataUrl: cached.dataUrl, loading: false, error: undefined };
    if (cached?.error) return { dataUrl: undefined, loading: false, error: cached.error };
    return { dataUrl: undefined, loading: true, error: undefined };
  });

  useEffect(() => {
    if (!videoUrl) {
      setState({ dataUrl: undefined, loading: false, error: undefined });
      return;
    }

    const cached = cache.get(videoUrl);
    if (cached?.dataUrl) {
      setState({ dataUrl: cached.dataUrl, loading: false, error: undefined });
      return;
    }
    if (cached?.error) {
      setState({ dataUrl: undefined, loading: false, error: cached.error });
      return;
    }

    const controller = new AbortController();
    setState({ dataUrl: undefined, loading: true, error: undefined });

    captureFrame(videoUrl, controller.signal).then(
      (dataUrl) => {
        cache.set(videoUrl, { dataUrl });
        if (!controller.signal.aborted) {
          setState({ dataUrl, loading: false, error: undefined });
        }
      },
      (err: Error) => {
        if (err instanceof ThumbnailAbortError) return;
        cache.set(videoUrl, { error: err });
        if (!controller.signal.aborted) {
          setState({ dataUrl: undefined, loading: false, error: err });
        }
      },
    );

    return () => {
      controller.abort();
    };
  }, [videoUrl]);

  return state;
}
