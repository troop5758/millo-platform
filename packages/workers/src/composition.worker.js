/**
 * Composition worker — video + audio mix via FFmpeg.
 * Job: videoUrl, audioUrl, trimStart, trimEnd, volume → output mp4.
 * FFmpeg: -i video -i audio -filter_complex amix=inputs=2 ...
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { connection } = require('./queues');
const db = require('@millo/database');

const COMPOSED_MEDIA_DIR = process.env.COMPOSED_MEDIA_DIR || path.join(process.cwd(), 'storage', 'composed');
const COMPOSED_MEDIA_BASE_URL = process.env.COMPOSED_MEDIA_BASE_URL || '';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Build filter_complex for: video audio + music (trim + volume), then amix.
 * [0:a] = video audio, [1:a] = music
 */
function buildFilterComplex(trimStart = 0, trimEnd = null, volume = 1) {
  const trimEndArg = trimEnd != null && trimEnd > trimStart ? `:end=${trimEnd}` : '';
  const vol = Math.max(0, Math.min(2, Number(volume) || 1));
  return `[0:a]volume=1.0[va];[1:a]atrim=start=${trimStart}${trimEndArg},volume=${vol}[ma];[va][ma]amix=inputs=2:duration=first[aout]`;
}

async function runFfmpeg(jobId, videoUrl, audioUrl, trimStart, trimEnd, volume, outputPath) {
  return new Promise((resolve, reject) => {
    const filter = buildFilterComplex(trimStart, trimEnd, volume);
    const args = [
      '-y',
      '-i', videoUrl,
      '-i', audioUrl,
      '-filter_complex', filter,
      '-map', '0:v',
      '-map', '[aout]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outputPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      reject(new Error(`FFmpeg spawn failed: ${err.message}. Is ffmpeg installed?`));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function processComposition(job) {
  const { jobId, videoUrl, audioUrl, trimStart = 0, trimEnd = null, volume = 1 } = job.data;
  if (!jobId || !videoUrl || !audioUrl) {
    throw new Error('Composition job missing jobId, videoUrl, or audioUrl');
  }
  ensureDir(COMPOSED_MEDIA_DIR);
  const outputPath = path.join(COMPOSED_MEDIA_DIR, `${jobId}.mp4`);

  await db.CompositionJob.updateOne(
    { _id: jobId },
    { $set: { status: 'processing', error: null } }
  ).catch(() => {});

  try {
    await runFfmpeg(jobId, videoUrl, audioUrl, trimStart, trimEnd, volume, outputPath);
    const outputUrl = COMPOSED_MEDIA_BASE_URL
      ? `${COMPOSED_MEDIA_BASE_URL.replace(/\/$/, '')}/${jobId}.mp4`
      : outputPath;
    await db.CompositionJob.updateOne(
      { _id: jobId },
      { $set: { status: 'completed', outputUrl, error: null } }
    );
    return { ok: true, jobId, outputUrl };
  } catch (err) {
    await db.CompositionJob.updateOne(
      { _id: jobId },
      { $set: { status: 'failed', error: err.message } }
    ).catch(() => {});
    throw err;
  }
}

const worker = new Worker(
  'composition',
  async (job) => processComposition(job),
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[composition-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, processComposition };
