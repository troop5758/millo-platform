'use strict';
/**
 * FFmpeg transcoding helpers — spawn-based (no shell interpolation).
 * Requires `ffmpeg` on PATH in the runtime that executes the worker.
 * https://milloapp.com
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

function runFfmpeg(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, {
      stdio: opts.stdio || 'pipe',
      env: process.env,
      cwd: opts.cwd,
    });
    let stderr = '';
    child.stderr?.on('data', (c) => { stderr += c.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stderr });
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Single-rendition transcode (720p ladder step).
 * @param {string} inputPath - Local path or URL ffmpeg can read
 * @param {string} outputPath - Output file path
 */
function transcodeVideo(inputPath, outputPath) {
  const args = [
    '-y',
    '-i', inputPath,
    '-vf', 'scale=720:-2',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-movflags', '+faststart',
    outputPath,
  ];
  return runFfmpeg(args);
}

/**
 * Multi-bitrate HLS (production ladder: 720p / 480p / 360p).
 * Writes master.m3u8 + stream_%v/stream.m3u8 + segments under outputDir.
 * @param {string} inputPath
 * @param {string} outputDir
 */
async function transcodeMultiBitrateHls(inputPath, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, 'stream_0'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'stream_1'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'stream_2'), { recursive: true });

  const args = [
    '-y',
    '-i', inputPath,
    '-filter_complex', '[0:v]split=3[v1][v2][v3];[v1]scale=1280:720[out1];[v2]scale=854:480[out2];[v3]scale=640:360[out3]',
    '-map', '[out1]', '-c:v:0', 'libx264', '-b:v:0', '3000k', '-preset', 'fast',
    '-map', '[out2]', '-c:v:1', 'libx264', '-b:v:1', '1500k', '-preset', 'fast',
    '-map', '[out3]', '-c:v:2', 'libx264', '-b:v:2', '800k', '-preset', 'fast',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_list_size', '0',
    '-master_pl_name', 'master.m3u8',
    '-hls_segment_filename', 'stream_%v/seg%03d.ts',
    'stream_%v/stream.m3u8',
  ];

  await runFfmpeg(args, { cwd: outputDir });
  return {
    masterPlaylistPath: path.join(outputDir, 'master.m3u8'),
    outputDir,
  };
}

module.exports = {
  transcodeVideo,
  transcodeMultiBitrateHls,
  runFfmpeg,
  FFMPEG_BIN,
};
