import React from 'react';
import { SupportMyTicketsPage } from '../SupportMyTicketsPage';

/**
 * @implicit-wrapper
 * Route: /support/history
 * This page is a thin wrapper around:
 * - Component: SupportMyTicketsPage
 * Keep route compatibility here; place real feature logic in the wrapped page.
 *
 * https://milloapp.com
 */
export function SupportHistoryPage() {
  return <SupportMyTicketsPage />;
}

