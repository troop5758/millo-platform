import React from 'react';
import { SupportPage } from '../SupportPage';

/**
 * @implicit-wrapper
 * Route: /support/admin
 * This page is a thin wrapper around:
 * - Component: SupportPage
 * Keep route compatibility here; place real feature logic in the wrapped page.
 *
 * https://milloapp.com
 */
export function SupportAdminPage() {
  return <SupportPage />;
}

