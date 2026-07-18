import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ListMusic,
  X,
  Music,
  ExternalLink,
} from 'lucide-react';
import { useMixstr } from '@/hooks/useMixstr';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { eventToNevent, extractVideos, extractAudio } from '@/lib/postUtils';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayerBar() {
  const navigate = useNavigate();
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    playNext,
    playPrev,
    clearQueue,
    audioProgress,
    setAudioProgress,
    audioDuration,
    setAudioDuration,
    audioQueue,
    playTrack,
  } = useMixstr();

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // Is the current track a video file?
  const isVideo = currentTrack
    ? extractVideos(currentTrack.event).length > 0 &&
      /\.(mp4|webm|mov)/i.test(currentTrack.url)
    : false;

  // Play/pause control
  useEffect(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isPlaying, isVideo]);

  // Load new track
  useEffect(() => {
    if (!currentTrack) return;
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    el.src = currentTrack.url;
    el.volume = volume;
    el.muted = muted;
    el.load();
    if (isPlaying) el.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.url]);

  // Volume sync
  useEffect(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (el) {
      el.volume = volume;
      el.muted = muted;
    }
  }, [volume, muted, isVideo]);

  if (!currentTrack) return null;

  const handleSeek = (values: number[]) => {
    const el = isVideo ? videoRef.current : audioRef.current;
    const pct = values[0] / 100;
    if (el && isFinite(audioDuration)) {
      el.currentTime = pct * audioDuration;
    }
    setAudioProgress(pct);
  };

  const handleArtClick = () => {
    // Navigate to the dedicated media player page with media URL and destination
    const params = new URLSearchParams();
    
    // Prefer video URL if available, otherwise use audio URL
    const videos = extractVideos(currentTrack.event);
    const audios = extractAudio(currentTrack.event);
    const mediaUrl = videos.length > 0 ? videos[0] : currentTrack.url;
    
    params.set('media', mediaUrl);
    params.set('title', currentTrack.title);
    
    // Check if it's an RSS event and get the destination link
    const rssLink = currentTrack.event.tags.find(([k]) => k === 'link')?.[1];
    if (rssLink) {
      params.set('dest', rssLink);
    }
    
    navigate(`/player?${params.toString()}`);
  };

  return (
    <>
      {/* Hidden audio element */}
      {!isVideo && (
        <audio
          ref={audioRef}
          className="hidden"
          onTimeUpdate={() => {
            const el = audioRef.current;
            if (el && el.duration) setAudioProgress(el.currentTime / el.duration);
          }}
          onDurationChange={() => setAudioDuration(audioRef.current?.duration ?? 0)}
          onEnded={playNext}
        />
      )}

      {/* Hidden video element for audio playback of video files */}
      {isVideo && (
        <video
          ref={videoRef}
          className="hidden"
          onTimeUpdate={() => {
            const el = videoRef.current;
            if (el && el.duration) setAudioProgress(el.currentTime / el.duration);
          }}
          onDurationChange={() => setAudioDuration(videoRef.current?.duration ?? 0)}
          onEnded={playNext}
        />
      )}

      {/* Player UI */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t border-border">
        {/* Queue panel */}
        {showQueue && (
          <div className="border-b border-border max-h-52 overflow-y-auto">
            <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
              <span>Queue ({audioQueue.length})</span>
            </div>
            {audioQueue.map((track, i) => (
              <div
                key={track.event.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 text-sm hover:bg-accent/30 transition-colors cursor-pointer',
                  currentTrack?.event.id === track.event.id && 'text-primary bg-primary/10',
                )}
                onClick={() => playTrack(track)}
              >
                <span className="text-xs text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                <div className="w-8 h-8 rounded bg-muted flex-shrink-0 overflow-hidden">
                  {track.artwork ? (
                    <img src={track.artwork} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={12} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-xs">{track.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-3 flex items-center gap-3 md:gap-4">
          {/* Album art / video preview — clickable to go to event page */}
          <div
            className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 cursor-pointer group/art"
            onClick={handleArtClick}
            title="Open in player"
          >
            {isVideo ? (
              /* For video tracks: show a still frame from the video */
              <video
                src={currentTrack.url}
                className="w-full h-full object-cover"
                muted
                preload="metadata"
              />
            ) : currentTrack.artwork ? (
              <img
                src={currentTrack.artwork}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music size={18} className="text-muted-foreground" />
              </div>
            )}
            {/* Hover overlay: go to page icon */}
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/art:opacity-100 transition-opacity">
              <ExternalLink size={14} className="text-white" />
            </div>
          </div>

          {/* Track info */}
          <div className="min-w-0 w-28 sm:w-40 md:w-48 flex-shrink-0">
            <p
              className="text-sm font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
              onClick={handleArtClick}
            >
              {currentTrack.title ?? 'Unknown'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {currentTrack.artist ?? ''}
            </p>
          </div>

          {/* Playback controls (center) */}
          <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="flex items-center gap-3 md:gap-4">
              <button
                onClick={playPrev}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipBack size={18} />
              </button>
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors flex-shrink-0"
              >
                {isPlaying
                  ? <Pause size={16} fill="currentColor" />
                  : <Play size={16} fill="currentColor" className="ml-0.5" />
                }
              </button>
              <button
                onClick={playNext}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipForward size={18} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2 w-full max-w-sm md:max-w-md">
              <span className="text-xs text-muted-foreground w-8 text-right flex-shrink-0">
                {formatTime(audioProgress * audioDuration)}
              </span>
              <Slider
                value={[audioProgress * 100]}
                onValueChange={handleSeek}
                max={100}
                step={0.1}
                className="flex-1 [&_[role=slider]]:w-3 [&_[role=slider]]:h-3"
              />
              <span className="text-xs text-muted-foreground w-8 flex-shrink-0">
                {formatTime(audioDuration)}
              </span>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setMuted((m) => !m)}
              className="text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div className="w-20 hidden md:block">
              <Slider
                value={[muted ? 0 : volume * 100]}
                onValueChange={(v) => {
                  setVolume(v[0] / 100);
                  setMuted(v[0] === 0);
                }}
                max={100}
                step={1}
              />
            </div>

            <button
              onClick={() => setShowQueue((s) => !s)}
              className={cn(
                'transition-colors',
                showQueue ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <ListMusic size={18} />
            </button>

            <button
              onClick={clearQueue}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Close player"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
