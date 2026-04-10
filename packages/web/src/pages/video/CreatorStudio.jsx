/**
 * @implicit-wrapper
 * Route: /creator/studio
 * This page is a thin wrapper around:
 * - Component: CreatorDashboardPage
 * Keep route compatibility here; place real feature logic in the wrapped page.
 *
 * https://milloapp.com
 */
import React from 'react';
import { CreatorDashboardPage } from '../CreatorDashboardPage';

export function CreatorStudio() {
  return <CreatorDashboardPage />;
}

