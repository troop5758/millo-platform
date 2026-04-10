'use strict';
/**
 * FFmpeg worker — record live ingest (e.g. RTMP) to HLS for playback / CDN origin.
 * Single-rendition ladder; clients (HLS.js) handle ABR when you serve multi-variant playlists elsewhere.
 * Requires `ffmpeg` on PATH (override with FFMPEG_PATH).
 * https://milloapp.com
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

/** @param {string} p */
function toFfmpegPath(p) {
  return path.resolve(p).split(path.sep).join('/');
}

/**
 * Start recording a stream to HLS (rolling window playlist). Returns the running child process — call `.kill('SIGINT')` to stop.
 *
 * @param {string} rtmpUrl - RTMP URL or any input ffmpeg accepts (-i)
 * @param {string} outputDir - Directory for index.m3u8 and segment TS files
 * @param {{
 *   onStderr?: (chunk: Buffer) => void,
 *   onError?: (err: Error) => void,
 *   onClose?: (code: number | null, signal: NodeJS.Signals | null) => void,
 * } | Record<string, never>} [opts]
 * @returns {import('child_process').ChildProcess}
 */
function recordStream(rtmpUrl, outputDir, opts = {}) {
  if (!rtmpUrl || typeof rtmpUrl !== 'string') {
    throw new Error('recordStream: rtmpUrl is required');
  }
  if (!outputDir || typeof outputDir !== 'string') {
    throw new Error('recordStream: outputDir is required');
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const playlistPath = toFfmpegPath(path.join(outputDir, 'index.m3u8'));
  const segmentPattern = toFfmpegPath(path.join(outputDir, 'segment%03d.ts'));

  const args = [
    '-hide_banner',
    '-loglevel',
    process.env.FFMPEG_LOG_LEVEL || 'info',
    '-i',
    rtmpUrl,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-c:a',
    'aac',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-b:a',
    '128k',
    '-f',
    'hls',
    '-hls_time',
    '4',
    '-hls_list_size',
    '5',
    '-hls_flags',
    'delete_segments+append_list+omit_endlist',
    '-hls_segment_filename',
    segmentPattern,
    playlistPath,
  ];

  const child = spawn(FFMPEG_BIN, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stderr?.on('data', (chunk) => {
    if (typeof opts.onStderr === 'function') opts.onStderr(chunk);
    else if (process.env.FFMPEG_LOG === '1') process.stderr.write(chunk);
  });

  child.on('error', (err) => {
    if (typeof opts.onError === 'function') opts.onError(err);
    else console.error('FFmpeg error:', err);
  });

  child.on('close', (code, signal) => {
    if (typeof opts.onClose === 'function') opts.onClose(code, signal);
    else if (code !== 0 && code !== null) {
      console.error('FFmpeg exited:', code, signal || '');
    }
  });

  return child;
}

module.exports = {
  recordStream,
  FFMPEG_BIN,
};
