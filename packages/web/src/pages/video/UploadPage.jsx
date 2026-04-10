/**
 * @implicit-wrapper
 * Route: /upload and /upload/edit
 * This page is a thin wrapper around:
 * - Component: GoLivePage
 * Keep route compatibility here; place real feature logic in the wrapped page.
 *
 * Backend note: no separate /videos/upload; creators start streams via GoLive flow.
 * https://milloapp.com
 */
import React from 'react';
import { GoLivePage } from '../GoLivePage';

export function UploadPage() {
  return <GoLivePage />;
}

