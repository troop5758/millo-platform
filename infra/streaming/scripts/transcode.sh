#!/bin/sh
# Millo FFmpeg transcoder — multi-bitrate HLS ladder
# Runs as a sidecar; watches for new RTMP streams and adds ABR variants.
set -e

HLS_DIR="/tmp/hls"
RECORDINGS="/recordings"

echo "FFmpeg transcoder ready. Watching $HLS_DIR for new streams…"

# The main encoding is handled by nginx-rtmp exec_push directives.
# This script is a placeholder for batch post-processing (e.g. VOD packaging).

while true; do
  # Package FLV recordings into MP4 / HLS VODs
  for flv in "$RECORDINGS"/*.flv; do
    [ -f "$flv" ] || continue
    base="${flv%.flv}"
    mp4="${base}.mp4"
    if [ ! -f "$mp4" ]; then
      echo "Packaging $flv → $mp4"
      ffmpeg -y -i "$flv" \
        -c:v copy -c:a aac \
        -movflags +faststart \
        "$mp4" 2>/dev/null && echo "Done: $mp4" || echo "Error packaging $flv"
    fi
  done
  sleep 30
done
