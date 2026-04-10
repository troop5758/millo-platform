/**
 * VideoPlayer — HLS live stream / VOD player.
 * Loads HLS.js dynamically (no SSR issues). Falls back to native <video> HLS on Safari.
 * Supports m3u8 streams and regular video URLs.
 * https://milloapp.com
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { LiveChat } from './LiveChat';
import { useUserSocket, useSocketEvent } from '../hooks/useUserSocket';
import { getCssFilterForId } from '../sdk/liveFilters';

function PlayIcon(p) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon(p) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}
function MuteIcon(p) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}
function VolumeIcon(p) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
    </svg>
  );
}
function FullscreenIcon(p) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

export function VideoPlayer({ src, poster, autoPlay = false, live = false, className = '', title, streamId = null, showChat = false }) {
  const videoRef  = useRef(null);
  const hlsRef    = useRef(null);
  const [playing, setPlaying]     = useState(autoPlay);
  const [muted,   setMuted]       = useState(true);
  const [volume,  setVolume]      = useState(0.8);
  const [progress, setProgress]   = useState(0);
  const [duration, setDuration]   = useState(0);
  const [error,   setError]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [viewers, setViewers]     = useState(null);
  const hideTimeout = useRef(null);
  const { joinStream, leaveStream } = useUserSocket();
  const cssFilter = getCssFilterForId(filterId);

  // Join stream via user socket for viewer_count + stream_ended events
  useEffect(() => {
    if (!streamId) return;
    joinStream(streamId);
    return () => leaveStream(streamId);
  }, [streamId, joinStream, leaveStream]);

  useSocketEvent('millo:viewer_count', useCallback((data) => {
    if (data?.streamId === streamId) setViewers(data.count);
  }, [streamId]));

  useSocketEvent('millo:stream_ended', useCallback((data) => {
    if (data?.streamId === streamId) setError('Stream has ended');
  }, [streamId]));

  const isHls = src && (src.includes('.m3u8') || src.includes('/hls/'));

  useEffect(() => {
    if (!src || !videoRef.current) { setLoading(false); return; }
    setError(null); setLoading(true);
    const video = videoRef.current;

    // Cleanup previous HLS instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (isHls) {
      // Try HLS.js first
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: live });
          hlsRef.current = hls;
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            if (autoPlay) video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) setError('Stream unavailable');
            setLoading(false);
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          video.src = src;
          video.addEventListener('loadedmetadata', () => { setLoading(false); if (autoPlay) video.play().catch(() => {}); });
        } else {
          setError('HLS not supported in this browser');
          setLoading(false);
        }
      }).catch(() => {
        // hls.js not installed — try native
        video.src = src;
        setLoading(false);
      });
    } else {
      video.src = src;
      video.addEventListener('loadeddata', () => setLoading(false));
      if (autoPlay) video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [src, autoPlay, isHls, live]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted  = muted;
    video.volume = muted ? 0 : volume;
  }, [muted, volume]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setPlaying(true); }
    else              { video.pause(); setPlaying(false); }
  }
  function toggleMute() { setMuted((m) => !m); }
  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress((v.currentTime / v.duration) * 100);
    setDuration(v.duration);
  }
  function handleSeek(e) {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * v.duration;
  }
  function handleFullscreen() {
    const container = videoRef.current?.parentElement;
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen?.();
  }
  function showCtrl() {
    setShowControls(true);
    clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setShowControls(false), 3000);
  }
  function fmtTime(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  if (!src) {
    return (
      <div className={`relative bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center ${className}`} style={{ minHeight: 200 }}>
        <div className="text-center text-slate-400 p-8">
          <svg className="w-12 h-12 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          <p className="text-sm">{title || 'Stream not available'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      className={`relative bg-black rounded-xl overflow-hidden group select-none ${className}`}
      onMouseMove={showCtrl} onTouchStart={showCtrl}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        muted={muted}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => { setDuration(videoRef.current?.duration || 0); setLoading(false); }}
        onError={() => { setError('Failed to load stream'); setLoading(false); }}
        className="w-full h-full object-cover cursor-pointer"
        onClick={togglePlay}
        style={{ minHeight: 200, filter: cssFilter || undefined }}
      />

      {/* Loading spinner */}
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <svg className="w-10 h-10 text-white animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M4.582 9A8 8 0 0120 15M19.418 15A8 8 0 014 9" />
          </svg>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm">
          <div className="text-center p-6">
            <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-slate-300">{error}</p>
          </div>
        </div>
      )}

      {/* LIVE badge + viewer count */}
      {live && !error && (
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </div>
          {viewers != null && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {viewers.toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className={`absolute bottom-0 left-0 right-0 bg-black/80 px-3 pb-3 pt-6 transition-opacity duration-200 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        {/* Progress bar (hidden for live streams) */}
        {!live && duration > 0 && (
          <div
            className="w-full h-1 bg-white/30 rounded-full mb-2 cursor-pointer"
            onClick={handleSeek}
          >
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="button" onClick={togglePlay} className="text-white hover:text-slate-200 transition-colors">
            {playing ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
          </button>
          <button type="button" onClick={toggleMute} className="text-white hover:text-slate-200 transition-colors">
            {muted ? <MuteIcon className="w-5 h-5" /> : <VolumeIcon className="w-5 h-5" />}
          </button>
          <input
            type="range" min="0" max="1" step="0.05"
            value={muted ? 0 : volume}
            onChange={(e) => { setVolume(Number(e.target.value)); setMuted(Number(e.target.value) === 0); }}
            className="w-16 h-1 accent-white"
          />
          {!live && duration > 0 && (
            <span className="text-white/70 text-xs ml-auto">{fmtTime((progress / 100) * duration)} / {fmtTime(duration)}</span>
          )}
          {live && <span className="text-white/70 text-xs ml-auto">LIVE</span>}
          <button type="button" onClick={handleFullscreen} className="text-white hover:text-slate-200 transition-colors">
            <FullscreenIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    {/* Live chat panel (opt-in via showChat prop) */}
    {showChat && streamId && (
      <LiveChat
        streamId={streamId}
        onViewerCount={(c) => setViewers(c)}
        className="mt-3"
      />
    )}
  </>
  );
}
