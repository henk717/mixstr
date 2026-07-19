import { useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';
import { HlsJsP2PEngine } from 'p2p-media-loader-hlsjs';
import type { IP2PConfig } from 'p2p-media-loader-core';

interface P2PVideoPlayerProps {
  streamUrl: string;
  className?: string;
}

/**
 * Generate a valid PeerJS ID from the stream URL
 * PeerJS IDs can only contain alphanumeric characters and hyphens
 */
function generatePeerId(streamUrl: string): string {
  // Extract a unique identifier from the URL
  const urlHash = streamUrl.split('/').pop() || streamUrl;
  // Remove invalid characters and limit length
  const cleanId = urlHash.replace(/[^a-zA-Z0-9\-]/g, '').substring(0, 20);
  // Add a random suffix to ensure uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `p2p-${cleanId}-${randomSuffix}`;
}

/**
 * P2P Video Player component using p2p-media-loader-hlsjs
 * Loads HLS streams from a local peer instead of external domains
 */
export function P2PVideoPlayer({ streamUrl, className = '' }: P2PVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current || !streamUrl) return;

    const video = videoRef.current;
    let hls: Hls | null = null;

    // Create Hls with P2P mixin
    const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

    // Generate a valid PeerJS ID
    const peerId = generatePeerId(streamUrl);

    // Configure P2P settings - no external peer server needed
    const p2pConfig: IP2PConfig = {
      enabled: true,
      peerjsConfig: {
        debug: 0, // Disable PeerJS logging
      },
      p2pSettings: {
        peerID: peerId,
        maxPeers: 10,
        enableWebRTC: true,
        enableMediaSource: true,
        enableChunkedTransfer: true,
      },
    };

    try {
      hls = new HlsWithP2P({
        p2p: p2pConfig,
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Video is ready to play
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError(`Stream error: ${data.type}`);
        }
      });
    } catch (err) {
      console.error('P2P HLS initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize P2P HLS player');
    }

    // Cleanup on unmount
    return () => {
      if (hls) {
        hls.destroy();
        hls = null;
      }
    };
  }, [streamUrl]);

  return (
    <div className={`relative ${className}`}>
      {error && (
        <div className="absolute top-2 right-2 z-10 bg-red-600/90 text-white text-xs px-2 py-1 rounded">
          {error}
        </div>
      )}
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />
    </div>
  );
}
