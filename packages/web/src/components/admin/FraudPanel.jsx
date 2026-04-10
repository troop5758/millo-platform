/**
 * Admin ops — fraud summary from parent (`fraud`) via WebSocket `metrics:update`.
 * https://milloapp.com
 */
import React from 'react';

export default function FraudPanel({ fraud }) {
  if (!fraud) {
    return (
      <div className="bg-red-900 p-4 rounded-xl text-red-200 text-sm">Waiting for metrics…</div>
    );
  }

  return (
    <div className="bg-red-900 p-4 rounded-xl text-red-50">
      <h3 className="font-semibold">Fraud Alerts</h3>
      <p className="mt-2">Flagged Users: {fraud.flaggedUsers}</p>
      <p className="mt-1">Blocked Transactions: {fraud.blockedTransactions}</p>
    </div>
  );
}
