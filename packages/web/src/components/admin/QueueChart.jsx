/**
 * Admin ops — queue waiting counts from parent (`queues`) via WebSocket `metrics:update` or HTTP fallback.
 * https://milloapp.com
 */
import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function QueueChart({ queues }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    if (!queues) {
      setData([]);
      return;
    }
    setData([
      { name: 'Video', value: Number(queues.videoProcessing) || 0 },
      { name: 'Moderation', value: Number(queues.moderation) || 0 },
      { name: 'Email', value: Number(queues.emails) || 0 },
    ]);
  }, [queues]);

  return (
    <div className="bg-gray-900 p-4 rounded-xl">
      <h3 className="text-gray-200 font-semibold mb-1">Queue Load</h3>
      <p className="text-gray-500 text-xs mb-3">Waiting jobs — live via WebSocket</p>
      <div className="w-full h-[200px] min-h-[200px]">
        {data.length === 0 && (
          <p className="text-gray-500 text-sm py-8 text-center">Waiting for metrics…</p>
        )}
        {data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} width={36} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid #374151',
                  borderRadius: 8,
                }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={{ r: 4, fill: '#a78bfa' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
