import React from 'react';
import { StreamPlayerPage } from '../StreamPlayerPage';

/**
 * @implicit-wrapper
 * Route: /live/:streamId
 * This page is a thin wrapper around:
 * - Component: StreamPlayerPage
 * Keep route compatibility here; place real feature logic in the wrapped page.
 *
 * Socket readiness is handled inside StreamPlayerPage / VideoPlayer.
 */
export function LiveStreamPage() {
  return <StreamPlayerPage />;
}

