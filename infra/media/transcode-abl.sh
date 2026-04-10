#!/bin/sh
# Millo — Adaptive Bitrate HLS transcoding
# Produces 720p HLS from RTMP stream. For full ABR ladder, run multiple instances
# or use nginx-rtmp exec_push. Usage: transcode-abl.sh <streamKey>

set -e
STREAM_KEY="${1:?Usage: transcode-abl.sh <streamKey>}"
RTMP_SRC="rtmp://localhost:1935/live/${STREAM_KEY}"
HLS_BASE="/tmp/hls/${STREAM_KEY}/720p"

mkdir -p "${HLS_BASE}"

ffmpeg -i "${RTMP_SRC}" \
  -c:v libx264 -preset veryfast -b:v 2500k -s 1280x720 -g 48 -keyint_min 48 \
  -c:a aac -b:a 128k \
  -f hls -hls_time 2 -hls_list_size 15 -hls_flags delete_segments \
  -hls_segment_filename "${HLS_BASE}/%03d.ts" "${HLS_BASE}/index.m3u8" \
  2>/dev/null || true
