'use strict';
/**
 * Audio CDN Storage — upload music files to S3, Cloudflare R2, or Google Cloud Storage.
 * Served via CDN at e.g. cdn.milloapp.com/music/trk_9981.mp3
 * https://milloapp.com
 */

const AUDIO_CDN_PROVIDER = (process.env.AUDIO_CDN_PROVIDER || 's3').toLowerCase();
const AUDIO_CDN_URL = (process.env.AUDIO_CDN_URL || process.env.CDN_BASE_URL || '').replace(/\/$/, '');
const AUDIO_CDN_BUCKET = process.env.AUDIO_CDN_BUCKET || process.env.UPLOAD_BUCKET || 'millo-music';

/**
 * Build the public CDN URL for a storage key.
 * @param {string} key - e.g. "music/trk_9981.mp3"
 * @returns {string} - e.g. "https://cdn.milloapp.com/music/trk_9981.mp3"
 */
function getCdnUrl(key) {
  if (!AUDIO_CDN_URL) return '';
  return `${AUDIO_CDN_URL}/${key.replace(/^\//, '')}`;
}

/**
 * Upload a buffer to the configured provider; return the CDN URL.
 * @param {string} key - Object key, e.g. "music/trk_9981.mp3"
 * @param {Buffer} buffer - File contents
 * @param {string} contentType - e.g. "audio/mpeg"
 * @returns {Promise<string>} - CDN URL for the uploaded file
 */
async function upload(key, buffer, contentType = 'audio/mpeg') {
  const normalizedKey = key.replace(/^\//, '');
  if (AUDIO_CDN_PROVIDER === 'r2') {
    return uploadR2(normalizedKey, buffer, contentType);
  }
  if (AUDIO_CDN_PROVIDER === 'gcs') {
    return uploadGcs(normalizedKey, buffer, contentType);
  }
  return uploadS3(normalizedKey, buffer, contentType);
}

async function uploadS3(key, buffer, contentType) {
  let S3Client, PutObjectCommand;
  try {
    ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
  } catch (e) {
    throw new Error('Install @aws-sdk/client-s3 for S3/R2 uploads: npm install @aws-sdk/client-s3');
  }
  const region = process.env.AWS_REGION || process.env.AUDIO_CDN_REGION || 'us-east-1';
  const bucket = process.env.AUDIO_CDN_BUCKET || process.env.UPLOAD_BUCKET || AUDIO_CDN_BUCKET;
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.AUDIO_CDN_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AUDIO_CDN_SECRET_ACCESS_KEY || '',
    },
  });
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return getCdnUrl(key);
}

async function uploadR2(key, buffer, contentType) {
  let S3Client, PutObjectCommand;
  try {
    ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
  } catch (e) {
    throw new Error('Install @aws-sdk/client-s3 for R2 uploads: npm install @aws-sdk/client-s3');
  }
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME || process.env.AUDIO_CDN_BUCKET || AUDIO_CDN_BUCKET;
  if (!accountId) throw new Error('R2_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID required for R2');
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AUDIO_CDN_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AUDIO_CDN_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  });
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return getCdnUrl(key);
}

async function uploadGcs(key, buffer, contentType) {
  let Storage;
  try {
    ({ Storage } = require('@google-cloud/storage'));
  } catch (e) {
    throw new Error('Install @google-cloud/storage for GCS uploads: npm install @google-cloud/storage');
  }
  const bucketName = process.env.GCS_BUCKET || process.env.AUDIO_CDN_BUCKET || AUDIO_CDN_BUCKET;
  const storage = new Storage({
    projectId: process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
  });
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(key);
  await file.save(buffer, {
    contentType,
    metadata: { cacheControl: 'public, max-age=31536000' },
  });
  return getCdnUrl(key);
}

/**
 * Check if Audio CDN storage is configured (provider + URL + credentials for upload).
 */
function isConfigured() {
  if (!AUDIO_CDN_URL) return false;
  if (AUDIO_CDN_PROVIDER === 'r2') {
    return !!(process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID) &&
      (process.env.R2_ACCESS_KEY_ID || process.env.AUDIO_CDN_ACCESS_KEY_ID) &&
      (process.env.R2_SECRET_ACCESS_KEY || process.env.AUDIO_CDN_SECRET_ACCESS_KEY);
  }
  if (AUDIO_CDN_PROVIDER === 'gcs') {
    return !!(process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT) &&
      (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCS_KEY_FILE);
  }
  return !!(process.env.AWS_ACCESS_KEY_ID || process.env.AUDIO_CDN_ACCESS_KEY_ID) &&
    (process.env.AWS_SECRET_ACCESS_KEY || process.env.AUDIO_CDN_SECRET_ACCESS_KEY);
}

module.exports = {
  getCdnUrl,
  upload,
  isConfigured,
  AUDIO_CDN_URL,
  AUDIO_CDN_PROVIDER,
  AUDIO_CDN_BUCKET,
};
