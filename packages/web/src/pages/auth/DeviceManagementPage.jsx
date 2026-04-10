import React from 'react';
import { SessionsPage } from '../SessionsPage';

/**
 * @implicit-wrapper
 * Route: /device-management
 * This page is a thin wrapper around:
 * - Component: SessionsPage
 * Keep route compatibility here; place real feature logic in the wrapped page.
 *
 * https://milloapp.com
 */
export function DeviceManagementPage() {
  return <SessionsPage />;
}

