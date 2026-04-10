'use strict';
/**
 * FFmpeg transcoding Kafka consumer — subscribes to video.uploaded, emits video.ready.
 * RabbitMQ: optional; bridge the same payload to Kafka topic video.uploaded from a small relay service.
 *
 * Enable: KAFKA_ENABLED=true, FFMPEG_TRANSCODE_ENABLED=true, ffmpeg on PATH.
 * https://milloapp.com
 */
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const kafka = require('../services/kafkaEventBus');
const { transcodeMultiBitrateHls, transcodeVideo } = require('../lib/ffmpegTranscode');
const db = require('@millo/database');

let _consumer = null;
let _runPromise = null;

async function walkFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walkFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Upload HLS output directory to S3 when S3_VOD_BUCKET (or AWS_S3_BUCKET) is set.
 * @returns {Promise<string|null>} Public master.m3u8 URL or null if skipped
 */
async function uploadHlsToS3(localHlsDir, keyPrefix) {
  const bucket = process.env.S3_VOD_BUCKET || process.env.AWS_S3_BUCKET;
  if (!bucket) return null;

  let S3Client;
  let PutObjectCommand;
  try {
    ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
  } catch {
    return null;
  }

  const region = process.env.AWS_REGION || 'us-east-1';
  const client = new S3Client({ region });
  const files = await walkFiles(localHlsDir);

  for (const filePath of files) {
    const rel = path.relative(localHlsDir, filePath).replace(/\\/g, '/');
    const Key = `${keyPrefix}/${rel}`;
    const Body = await fs.readFile(filePath);
    let ContentType = 'application/octet-stream';
    if (rel.endsWith('.m3u8')) ContentType = 'application/vnd.apple.mpegurl';
    else if (rel.endsWith('.ts')) ContentType = 'video/mp2t';

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key,
      Body,
      ContentType,
    }));
  }

  const base = (process.env.S3_VOD_PUBLIC_BASE || '').replace(/\/$/, '');
  if (base) {
    return `${base}/${keyPrefix}/master.m3u8`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${keyPrefix}/master.m3u8`;
}

async function handlePayload(payload) {
  const p = payload || {};
  if (p.event && p.event !== 'video.uploaded') return;
  const streamId = p.streamId || p.vodId;
  const recordingUrl = p.recordingUrl || p.inputPath || p.input;
  if (!streamId || !recordingUrl) return;

  const workRoot = process.env.FFMPEG_WORK_DIR || path.join(os.tmpdir(), 'millo-transcode');
  const jobDir = path.join(workRoot, String(streamId));
  const hlsDir = path.join(jobDir, 'hls');

  await fs.mkdir(jobDir, { recursive: true });
  await fs.rm(hlsDir, { recursive: true, force: true }).catch(() => {});

  let masterLocal;
  try {
    if (process.env.FFMPEG_MULTIBITRATE_HLS === 'false') {
      const outMp4 = path.join(jobDir, 'out_720.mp4');
      await transcodeVideo(recordingUrl, outMp4);
      masterLocal = outMp4;
    } else {
      const { masterPlaylistPath } = await transcodeMultiBitrateHls(recordingUrl, hlsDir);
      masterLocal = masterPlaylistPath;
    }
  } catch (err) {
    await kafka.publish(kafka.TOPICS.VIDEO_READY, {
      event: 'video.failed',
      streamId: String(streamId),
      userId: p.userId,
      error: err.message || 'TRANSCODE_FAILED',
    }).catch(() => {});
    throw err;
  }

  let playbackUrl = null;
  if (process.env.FFMPEG_MULTIBITRATE_HLS !== 'false') {
    playbackUrl = await uploadHlsToS3(hlsDir, `vod/${streamId}`);
  }

  if (!playbackUrl && masterLocal) {
    playbackUrl = `file://${masterLocal}`;
  }

  if (playbackUrl && !String(playbackUrl).startsWith('file:')) {
    await db.LiveStream.findByIdAndUpdate(streamId, {
      $set: {
        recordingUrl: playbackUrl,
        'meta.hlsTranscoded': process.env.FFMPEG_MULTIBITRATE_HLS !== 'false',
        'meta.transcodedAt': new Date(),
      },
    }).catch(() => {});
  }

  await kafka.publish(kafka.TOPICS.VIDEO_READY, {
    event: 'video.ready',
    streamId: String(streamId),
    userId: p.userId,
    playbackUrl,
    thumbnailUrl: p.thumbnailUrl || null,
  }).catch(() => {});

  await kafka.publish(kafka.TOPICS.VIDEO_EVENTS, {
    type: 'video.transcoded',
    streamId: String(streamId),
    userId: p.userId,
    playbackUrl,
    thumbnailUrl: p.thumbnailUrl || null,
  }).catch(() => {});
}

async function start(opts = {}) {
  const log = opts.log || console;
  if (!kafka.isEnabled()) {
    log.info?.('[ffmpeg.worker] Kafka disabled, skipping');
    return { consumer: null, run: Promise.resolve() };
  }
  if (process.env.FFMPEG_TRANSCODE_ENABLED !== 'true') {
    log.info?.('[ffmpeg.worker] Set FFMPEG_TRANSCODE_ENABLED=true to consume video.uploaded');
    return { consumer: null, run: Promise.resolve() };
  }

  const groupId = process.env.KAFKA_FFMPEG_CONSUMER_GROUP_ID || 'millo-ffmpeg-transcoder';
  const { consumer, run } = await kafka.startConsumer(
    groupId,
    [kafka.TOPICS.VIDEO_UPLOADED],
    (payload) => handlePayload(payload),
    { fromBeginning: false, log },
  );
  _consumer = consumer;
  _runPromise = run;
  if (run) run.catch((err) => log.error?.({ err }, '[ffmpeg.worker] consumer run error'));
  log.info?.({ topic: kafka.TOPICS.VIDEO_UPLOADED, groupId }, '[ffmpeg.worker] started');
  return { consumer, run };
}

async function stop() {
  if (_consumer) {
    try {
      await _consumer.disconnect();
    } catch {}
    _consumer = null;
  }
  _runPromise = null;
}

module.exports = {
  start,
  stop,
  handlePayload,
  transcodeVideo: require('../lib/ffmpegTranscode').transcodeVideo,
  transcodeMultiBitrateHls: require('../lib/ffmpegTranscode').transcodeMultiBitrateHls,
};
