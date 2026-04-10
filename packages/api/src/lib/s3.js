'use strict';
/**
 * S3 object storage — recorded streams, thumbnails, clips.
 * Uses `@aws-sdk/client-s3` (v3), same stack as `audioCdnStorage` / ffmpeg HLS upload.
 *
 * Env: `AWS_REGION`, optional `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (else default credential chain),
 *      bucket: `S3_BUCKET` or `AWS_S3_BUCKET` or `S3_VOD_BUCKET`
 * Optional public URL base: `S3_PUBLIC_BASE` or `CDN_BASE_URL` (https://milloapp.com CDN)
 * https://milloapp.com
 */

/**
 * Key prefixes for live/VOD assets (use with your own filenames).
 */
const PREFIX = Object.freeze({
  RECORDINGS: 'recordings',
  THUMBNAILS: 'thumbnails',
  CLIPS: 'clips',
});

function getBucket() {
  return (
    process.env.S3_BUCKET
    || process.env.AWS_S3_BUCKET
    || process.env.S3_VOD_BUCKET
    || ''
  ).trim();
}

function getRegion() {
  return process.env.AWS_REGION || 'us-east-1';
}

function getS3Client() {
  let S3Client;
  try {
    ({ S3Client } = require('@aws-sdk/client-s3'));
  } catch {
    throw new Error('Install @aws-sdk/client-s3 for S3 uploads');
  }
  const region = getRegion();
  const config = { region };
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return new S3Client(config);
}

/**
 * Public or virtual-host URL for a key (for clients / playback metadata).
 * @param {string} key
 * @param {string} [bucketOverride]
 */
function getPublicUrlForKey(key, bucketOverride) {
  const k = String(key).replace(/^\//, '');
  const base = (process.env.S3_PUBLIC_BASE || process.env.CDN_BASE_URL || '').replace(/\/$/, '');
  if (base) return `${base}/${k}`;
  const bucket = bucketOverride || getBucket();
  if (!bucket) return '';
  return `https://${bucket}.s3.${getRegion()}.amazonaws.com/${k}`;
}

function keyRecording(streamId, filename) {
  return `${PREFIX.RECORDINGS}/${String(streamId).replace(/^\//, '')}/${filename.replace(/^\//, '')}`;
}

function keyThumbnail(streamId, filename = 'poster.jpg') {
  return `${PREFIX.THUMBNAILS}/${String(streamId).replace(/^\//, '')}/${filename.replace(/^\//, '')}`;
}

function keyClip(streamId, clipId, filename = 'clip.mp4') {
  return `${PREFIX.CLIPS}/${String(streamId).replace(/^\//, '')}/${String(clipId).replace(/^\//, '')}/${filename.replace(/^\//, '')}`;
}

/**
 * Upload one object to S3 (PutObject).
 * @param {Buffer|Uint8Array|import('stream').Readable|string} file - Body; strings become UTF-8 buffers
 * @param {string} key - Object key (no leading slash recommended)
 * @param {{
 *   bucket?: string,
 *   contentType?: string,
 *   cacheControl?: string,
 *   contentDisposition?: string,
 * }} [opts]
 * @returns {Promise<{ bucket: string, key: string, etag?: string, location: string }>}
 */
async function uploadFile(file, key, opts = {}) {
  let PutObjectCommand;
  try {
    ({ PutObjectCommand } = require('@aws-sdk/client-s3'));
  } catch {
    throw new Error('Install @aws-sdk/client-s3 for S3 uploads');
  }

  const bucket = opts.bucket || getBucket();
  if (!bucket) {
    throw new Error('S3_BUCKET, AWS_S3_BUCKET, or S3_VOD_BUCKET is required');
  }

  const normalizedKey = String(key).replace(/^\//, '');
  let Body = file;
  if (typeof file === 'string') {
    Body = Buffer.from(file, 'utf8');
  }

  const client = getS3Client();
  const input = {
    Bucket: bucket,
    Key: normalizedKey,
    Body,
  };
  if (opts.contentType) input.ContentType = opts.contentType;
  if (opts.cacheControl) input.CacheControl = opts.cacheControl;
  if (opts.contentDisposition) input.ContentDisposition = opts.contentDisposition;

  const out = await client.send(new PutObjectCommand(input));

  return {
    bucket,
    key: normalizedKey,
    etag: out.ETag,
    location: getPublicUrlForKey(normalizedKey, bucket),
  };
}

module.exports = {
  PREFIX,
  getBucket,
  getRegion,
  getPublicUrlForKey,
  keyRecording,
  keyThumbnail,
  keyClip,
  uploadFile,
};
