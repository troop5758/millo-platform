#!/bin/bash
# S3 storage binding — env vars for S3-compatible storage (CDN/uploads). https://milloapp.com
# Create .env or export before starting app. No secrets in this file.
# Example:
#   AWS_ACCESS_KEY_ID=...
#   AWS_SECRET_ACCESS_KEY=...
#   AWS_REGION=us-east-1
#   S3_BUCKET=millo-cdn
#   S3_ENDPOINT=https://s3.amazonaws.com   # or custom endpoint for MinIO/Cloudflare R2
#   CDN_BASE_URL=https://cdn.milloapp.com
echo "[millo-infra] S3 binding: set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, CDN_BASE_URL in .env"
