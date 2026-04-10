/**
 * Admin ops — live streams + concurrent viewers from parent (`live`) via WebSocket `metrics:update`.
 * https://milloapp.com
 */
import React from 'react';

export default function LivePanel({ live }) {
  if (!live) {
    return (
      <div className="bg-gray-900 p-4 rounded-xl text-gray-500 text-sm">Waiting for metrics…</div>
    );
  }

  return (
    <div className="bg-gray-900 p-4 rounded-xl">
      <h3 className="text-gray-200 font-semibold">Live System</h3>
      <p className="text-gray-300 mt-2">
        Active Streams: {live.activeStreams != null ? live.activeStreams : '—'}
      </p>
      <p className="text-gray-300 mt-1">
        Concurrent Viewers: {live.concurrentViewers != null ? live.concurrentViewers : '—'}
      </p>
    </div>
  );
}
