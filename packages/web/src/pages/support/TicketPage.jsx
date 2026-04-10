import React from 'react';
import { SupportTicketPage } from './SupportTicketPage';

/**
 * TicketPage — Phase 7 naming wrapper.
 *
 * The project already implements the full ticket thread UI in `SupportTicketPage`
 * (REST + real-time socket updates). This file exists to match the expected
 * route/component naming without duplicating logic.
 */
export function TicketPage() {
  return <SupportTicketPage />;
}

