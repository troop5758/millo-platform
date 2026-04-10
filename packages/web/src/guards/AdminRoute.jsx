import React from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';

/**
 * AdminRoute — shorthand guard for admin-only pages.
 * https://milloapp.com
 */
export function AdminRoute({ children }) {
  return <ProtectedRoute requireRole="admin">{children}</ProtectedRoute>;
}

