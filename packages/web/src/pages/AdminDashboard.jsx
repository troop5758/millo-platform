/**
 * Admin Ops Dashboard — real-time via WebSocket `metrics:update` (native WS), HTTP polling fallback.
 * Connect: `wss?://<api>/admin/ws?token=…` → messages `{ event: 'metrics:update', data }`.
 * Route: /admin/ops
 * https://milloapp.com
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { IconBack } from '../components/StaffIcons';
import { useStaffAuth } from '../context/StaffAuth';
import { useAdminOpsMetricsSocket } from '../hooks/useAdminOpsMetricsSocket';
import OverviewCards from '../components/admin/OverviewCards';
import QueueChart from '../components/admin/QueueChart';
import RevenueChart from '../components/admin/RevenueChart';
import LivePanel from '../components/admin/LivePanel';
import FraudPanel from '../components/admin/FraudPanel';
import { OperationalStubBanner } from '../components/OperationalStubBanner';

function AdminDashboardContent() {
  const { staffUser } = useStaffAuth();
  const { snapshot, transport, error } = useAdminOpsMetricsSocket({ staffUser });

  return (
    <div className="p-6 space-y-6 bg-black text-white min-h-screen">
      <SEO title="Admin Ops Dashboard" description="Operations overview — users, queues, revenue, live." path="/admin/ops" />
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin Ops Dashboard</h1>
          <p className="text-zinc-500 text-xs mt-1">
            {transport === 'ws' && 'Live updates: WebSocket (metrics:update)'}
            {transport === 'polling' && 'Live updates: HTTP polling (WebSocket unavailable)'}
            {transport === 'connecting' && 'Connecting…'}
          </p>
        </div>
        <Link
          to="/admin"
          className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 hover:bg-zinc-700 transition-colors"
          aria-label="Back to admin"
        >
          <IconBack className="w-5 h-5" />
        </Link>
      </header>

      <OperationalStubBanner variant="admin" className="mb-6 border-amber-600/50 bg-amber-950/40 text-amber-100" />

      {error && !snapshot && (
        <div className="rounded-lg border border-red-900/80 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!snapshot && !error && <div className="text-zinc-400">Loading…</div>}

      {snapshot && (
        <>
          <OverviewCards data={snapshot.overview} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <QueueChart queues={snapshot.queues} />
            <RevenueChart payments={snapshot.payments} />
          </div>
          <LivePanel live={snapshot.live} />
          <FraudPanel fraud={snapshot.fraud} />
        </>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <ProtectedRoute requireRole="admin">
      <AdminDashboardContent />
    </ProtectedRoute>
  );
}
