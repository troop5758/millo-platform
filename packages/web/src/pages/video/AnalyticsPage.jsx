/**
 * AnalyticsPage — creator analytics surface.
 *
 * Backend connections live inside CreatorDashboardPage:
 *  - GET /content/analytics/me
 *  - plus other creator panels (ads, PPV, etc.)
 *
 * Route target: /analytics
 *
 * https://milloapp.com
 */
import React from 'react';
import { CreatorDashboardPage } from '../CreatorDashboardPage';

export function AnalyticsPage() {
  return <CreatorDashboardPage />;
}

