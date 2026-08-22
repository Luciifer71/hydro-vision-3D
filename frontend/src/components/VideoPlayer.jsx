import { useRef, useState, useEffect, useCallback } from 'react';
import { useStore } from '../store.js';

/**
 * VideoPlayer — Plays a local video file in the FlyView panel.
 * Extracts video metadata (resolution, fps, currentTime) and
 * calls onFrameUpdate callback with frame info every animation frame.
 */
export default function VideoPlayer({ src = '/sample-drone.mp4', onFrameUpdate, onStatusChange }) {
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const { switchToLiveFeed, feedMode } = useStore();

  // Extract metadata once video is loaded
  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const info = {
      width: v.videoWidth,
      height: v.videoHeight,
      duration: v.duration,
      fps: 30, // assumed — HTML5 video doesn't expose native FPS
    };
    setVideoInfo(info);
    setHasError(false);
    onStatusChange?.('READY');
  }, [onStatusChange]);

  // Animation frame loop to push frame updates
  const tick = useCallback(() => {
    const v = videoRef.current;
    if (v && !v.paused && !v.ended) {
      const frameNum = Math.floor(v.currentTime * (videoInfo?.fps || 30));
      onFrameUpdate?.({
        frameId: frameNum,
        currentTime: v.currentTime,
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
        progress: v.duration > 0 ? v.currentTime / v.duration : 0,
      });
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onFrameUpdate, videoInfo]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick]);

  // Auto-reload & play when video src updates (e.g., file upload)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setHasError(false);
    v.load();
    v.play().then(() => {
      setIsPlaying(true);
      onStatusChange?.('PLAYING');
    }).catch((err) => {
      console.warn('Playback notice:', err);
    });
  }, [src, onStatusChange]);

  const handlePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play().then(() => {
      setIsPlaying(true);
      onStatusChange?.('PLAYING');
    }).catch(() => {
      setHasError(true);
      onStatusChange?.('ERROR');
    });
  };

  const handlePause = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setIsPlaying(false);
    onStatusChange?.('PAUSED');
  };

  const handleRestart = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().then(() => {
      setIsPlaying(true);
      onStatusChange?.('PLAYING');
    }).catch(() => setHasError(true));
  };

  const handleError = (e) => {
    console.warn('Video decoding error on source:', src, e);
    setHasError(true);
    onStatusChange?.('ERROR');
  };

  const handleEnded = () => {
    setIsPlaying(false);
    onStatusChange?.('ENDED');
  };

  const handleSwitchToSample = () => {
    setHasError(false);
    switchToLiveFeed();
  };

  if (hasError) {
    return (
      <div className="video-placeholder" style={{ gap: 14, background: 'linear-gradient(135deg, #1f1a1a, #111111)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: '#ffbb00', fontWeight: 800 }}>
          VIDEO FORMAT INCOMPATIBLE
        </div>
        <div className="video-label" style={{ maxWidth: '85%', textAlign: 'center', fontSize: '0.82rem', color: '#ccc', lineHeight: 1.5 }}>
          The uploaded file format/codec is not natively readable by your web browser's HTML5 video engine (H.265 / MKV / AVI).
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            className="btn btn-primary"
            onClick={handleSwitchToSample}
            style={{ background: 'var(--amber)', color: '#1a1a1a', fontWeight: 700 }}
          >
            ▶ Switch to Live Drone Feed
          </button>
          <button
            className="btn btn-outline"
            onClick={() => setHasError(false)}
            style={{ borderColor: '#555', color: '#aaa' }}
          >
            Retry Uploaded Video
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <video
        ref={videoRef}
        className="video-feed"
        src={src}
        muted
        loop
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleError}
        onEnded={handleEnded}
      />
      <div className="video-controls">
        {!isPlaying ? (
          <button onClick={handlePlay}>PLAY</button>
        ) : (
          <button onClick={handlePause}>PAUSE</button>
        )}
        <button onClick={handleRestart}>RESTART</button>
        {videoInfo && (
          <span style={{ color: '#555', fontSize: '0.7rem', alignSelf: 'center' }}>
            {videoInfo.width}x{videoInfo.height} | {Math.floor(videoInfo.duration)}s
          </span>
        )}
      </div>
    </>
  );
}
