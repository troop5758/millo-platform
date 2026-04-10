/**
 * Admin ops — payment activity bars; data from parent (`payments`) via WebSocket `metrics:update`.
 * https://milloapp.com
 */
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const BAR_COLORS = { Volume: '#34d399', Failed: '#f87171', Pending: '#fbbf24' };

export default function RevenueChart({ payments }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    if (!payments) {
      setData([]);
      return;
    }
    setData([
      { name: 'Volume', value: Number(payments.totalVolume) || 0 },
      { name: 'Failed', value: Number(payments.failedPayments) || 0 },
      { name: 'Pending', value: Number(payments.payoutsPending) || 0 },
    ]);
  }, [payments]);

  return (
    <div className="bg-gray-900 p-4 rounded-xl">
      <h3 className="text-gray-200 font-semibold mb-1">Revenue</h3>
      <p className="text-gray-500 text-xs mb-3">
        Volume = gift txn counter; Failed = payment errors; Pending = payout requests
      </p>
      <div className="w-full h-[200px] min-h-[200px]">
        {data.length === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center">Waiting for metrics…</p>
        )}
        {data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} width={40} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid #374151',
                  borderRadius: 8,
                }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={BAR_COLORS[entry.name] || '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
