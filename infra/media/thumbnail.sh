#!/bin/sh
# Millo — Extract thumbnail from video (FLV/MP4)
# Usage: thumbnail.sh <video-path> [output-path]
# Default output: <video-base>.jpg at 5s

set -e
INPUT="${1:?Usage: thumbnail.sh <video-path> [output-path]}"
OUTPUT="${2:-${INPUT%.*}.jpg}"

ffmpeg -y -ss 5 -i "${INPUT}" -vframes 1 -q:v 2 "${OUTPUT}" 2>/dev/null
echo "Thumbnail: ${OUTPUT}"
