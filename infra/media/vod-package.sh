#!/bin/sh
# Millo — VOD packaging: FLV recording → MP4 + HLS VOD
# Run post-stream (on_done) or as batch job.
# Input: /recordings/<streamKey>-<timestamp>.flv
# Output: S3 or local /vod/<streamKey>/master.m3u8 + variants

set -e
INPUT="${1:?Usage: vod-package.sh <path-to-flv>}"
OUTPUT_DIR="${2:-/vod}"
BASE=$(basename "${INPUT}" .flv)

mkdir -p "${OUTPUT_DIR}/${BASE}"

# MP4 (single file, fast start)
ffmpeg -y -i "${INPUT}" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  "${OUTPUT_DIR}/${BASE}.mp4"

# HLS VOD (optional, for adaptive playback)
ffmpeg -y -i "${INPUT}" \
  -c:v libx264 -preset medium -crf 23 -s 1280x720 \
  -c:a aac -b:a 128k \
  -f hls -hls_time 6 -hls_list_size 0 -hls_segment_filename "${OUTPUT_DIR}/${BASE}/%03d.ts" \
  "${OUTPUT_DIR}/${BASE}/index.m3u8"

echo "VOD packaged: ${OUTPUT_DIR}/${BASE}.mp4"
