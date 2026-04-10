/**
 * Admin ops — overview stat cards from GET /admin/metrics/overview.
 * `revenue24h` is cents from the API; shown as dollars (not `$${data.revenue24h}`).
 * https://milloapp.com
 */
import React from 'react';

export default function OverviewCards({ data }) {
  if (!data) return null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card title="Users" value={data.users} />
      <Card title="Active Streams" value={data.activeStreams} />
      <Card
        title="Revenue (24h)"
        value={
          data.revenue24h == null || Number.isNaN(Number(data.revenue24h))
            ? '—'
            : `$${(Number(data.revenue24h) / 100).toFixed(2)}`
        }
      />
      <Card title="Queue Jobs" value={data.queueJobs} />
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="bg-gray-900 p-4 rounded-xl shadow">
      <p className="text-gray-400">{title}</p>
      <h2 className="text-xl font-bold">{value}</h2>
    </div>
  );
}
