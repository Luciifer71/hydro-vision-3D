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
  const { switchToLiveFeed, feedMode, uploadVideo } = useStore();
  const isLiveFeed = feedMode === 'live';
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadVideo(file);
    }
  };

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

  // Load sample hazards if playing the default sample video
  useEffect(() => {
    if (src === '/sample-drone.mp4') {
      const storeState = useStore.getState();
      if (storeState.hazards.length === 0 && storeState.fetchGeoJsonHazards) {
        storeState.fetchGeoJsonHazards();
      }
    }
  }, [src]);

  // Reset error state whenever src changes so new video uploads mount the video element
  useEffect(() => {
    setHasError(false);
  }, [src]);

  // Auto-reload & play when video src updates or error clears
  useEffect(() => {
    if (hasError) return;
    const v = videoRef.current;
    if (!v) return;
    
    v.load();
    const playPromise = v.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          onStatusChange?.('PLAYING');
        })
        .catch((err) => {
          console.warn('Auto-playback notice:', err);
        });
    }
  }, [src, hasError, onStatusChange]);

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
    if (isLiveFeed) {
      return (
        <div className="video-placeholder" style={{ gap: 14, background: 'linear-gradient(135deg, #181414, #0d0d10)', padding: 24, textAlign: 'center' }}>
          <div style={{ marginBottom: 4 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z"/>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: '#ffbb00', fontWeight: 800, letterSpacing: '1px' }}>
            NO LIVE DRONE FEED SIGNAL
          </div>
          <div className="video-label" style={{ maxWidth: '80%', fontSize: '0.82rem', color: '#bbb', lineHeight: 1.6 }}>
            Live drone video stream is currently offline or unreachable. Please verify that the FastAPI backend service is running, or upload a pre-recorded flight video for AI analysis.
          </div>
          <input
            type="file"
            ref={fileInputRef}
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn"
              onClick={() => { setHasError(false); switchToLiveFeed(); }}
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#1a1a1a', fontWeight: 800, padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Retry Live Feed
            </button>
            <button
              className="btn btn-outline"
              onClick={() => fileInputRef.current?.click()}
              style={{ borderColor: 'var(--amber)', color: 'var(--amber)', fontWeight: 700, padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Upload Flight Video
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="video-placeholder" style={{ gap: 14, background: 'linear-gradient(135deg, #1f1a1a, #111111)', padding: 24, textAlign: 'center' }}>
        <div style={{ marginBottom: -4 }}>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: '#ffbb00', fontWeight: 800 }}>
          VIDEO FORMAT INCOMPATIBLE
        </div>
        <div className="video-label" style={{ maxWidth: '85%', fontSize: '0.82rem', color: '#ccc', lineHeight: 1.5 }}>
          The uploaded file format/codec is not natively readable by your web browser's HTML5 video engine (H.265 / MKV / AVI).
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, justifyContent: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleSwitchToSample}
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#1a1a1a', fontWeight: 800 }}
          >
            Switch to Live Drone Feed
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
