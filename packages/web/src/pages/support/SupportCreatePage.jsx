import React from 'react';
import { SupportFormPage } from '../SupportFormPage';

/**
 * @implicit-wrapper
 * Route: /support/create
 * This page is a thin wrapper around:
 * - Component: SupportFormPage
 * Keep route compatibility here; place real feature logic in the wrapped page.
 *
 * https://milloapp.com
 */
export function SupportCreatePage() {
  return <SupportFormPage />;
}

