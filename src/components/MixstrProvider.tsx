import { ReactNode, useCallback, useRef, useState } from 'react';
import { MixstrContext, type AudioTrack, type FeedViewMode } from '@/contexts/MixstrContext';

export function MixstrProvider({ children }: { children: ReactNode }) {
  const [feedViewModes, setFeedViewModes] = useState<Record<string, FeedViewMode>>({});
  const [audioQueue, setAudioQueue] = useState<AudioTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const currentIndexRef = useRef<number>(-1);

  const setFeedViewMode = useCallback((feedKey: string, mode: FeedViewMode) => {
    setFeedViewModes((prev) => ({ ...prev, [feedKey]: mode }));
  }, []);

  const playTrack = useCallback((track: AudioTrack) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setAudioProgress(0);
    // Update or add to queue
    setAudioQueue((prev) => {
      const idx = prev.findIndex((t) => t.event.id === track.event.id);
      if (idx >= 0) {
        currentIndexRef.current = idx;
        return prev;
      }
      const newQueue = [track, ...prev];
      currentIndexRef.current = 0;
      return newQueue;
    });
  }, []);

  const addToQueue = useCallback((track: AudioTrack) => {
    setAudioQueue((prev) => {
      const exists = prev.some((t) => t.event.id === track.event.id);
      if (exists) return prev;
      return [...prev, track];
    });
  }, []);

  const playNext = useCallback(() => {
    setAudioQueue((queue) => {
      if (queue.length === 0) return queue;
      const currentIdx = currentTrack
        ? queue.findIndex((t) => t.event.id === currentTrack.event.id)
        : -1;
      const nextIdx = (currentIdx + 1) % queue.length;
      setCurrentTrack(queue[nextIdx]);
      setIsPlaying(true);
      setAudioProgress(0);
      return queue;
    });
  }, [currentTrack]);

  const playPrev = useCallback(() => {
    setAudioQueue((queue) => {
      if (queue.length === 0) return queue;
      const currentIdx = currentTrack
        ? queue.findIndex((t) => t.event.id === currentTrack.event.id)
        : -1;
      const prevIdx = currentIdx <= 0 ? queue.length - 1 : currentIdx - 1;
      setCurrentTrack(queue[prevIdx]);
      setIsPlaying(true);
      setAudioProgress(0);
      return queue;
    });
  }, [currentTrack]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const clearQueue = useCallback(() => {
    setAudioQueue([]);
    setCurrentTrack(null);
    setIsPlaying(false);
  }, []);

  return (
    <MixstrContext.Provider
      value={{
        feedViewModes,
        setFeedViewMode,
        audioQueue,
        currentTrack,
        isPlaying,
        addToQueue,
        playTrack,
        playNext,
        playPrev,
        togglePlay,
        clearQueue,
        audioProgress,
        setAudioProgress,
        audioDuration,
        setAudioDuration,
      }}
    >
      {children}
    </MixstrContext.Provider>
  );
}
