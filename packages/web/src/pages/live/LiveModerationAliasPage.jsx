import React from 'react';
import { ModeratorPage } from '../ModeratorPage';

/**
 * @implicit-wrapper
 * Route: /live/moderation
 * This page is a thin wrapper around:
 * - Component: ModeratorPage
 * Keep route compatibility here; place real feature logic in the wrapped page.
 *
 * https://milloapp.com
 */
export function LiveModerationAliasPage() {
  return <ModeratorPage />;
}

