/**
 * Admin ops dashboard — WebSocket `metrics:update` with HTTP polling fallback.
 * Native WebSocket JSON: `{ event: 'metrics:update', data: { overview, queues, live, payments, fraud } }`.
 * (Socket.IO-style `socket.on('metrics:update', fn)` → use `msg.event === 'metrics:update'`.)
 * https://milloapp.com
 */
import { useEffect, useState, useCallback } from 'react';
import { getApiBase } from '../config/api';
import * as api from '../sdk/dashboardsApi';

const POLL_MS = 10_000;
const TOKEN_KEY = 'millo_token';

function sumCounterValues(counter) {
  if (!counter?.values?.length) return 0;
  return counter.values.reduce((s, v) => s + (Number(v.value) || 0), 0);
}

function collectFlaggedUserIds(alerts) {
  const ids = new Set();
  if (!Array.isArray(alerts)) return ids;
  for (const a of alerts) {
    if (a.userId) ids.add(String(a.userId));
    if (a.alertType === 'device_farm' && Array.isArray(a.meta?.userIds)) {
      for (const u of a.meta.userIds) {
        if (u) ids.add(String(u));
      }
    }
  }
  return ids;
}

function countBlocked(alerts) {
  if (!Array.isArray(alerts)) return 0;
  return alerts.filter((a) => a.action === 'block').length;
}

function normalizeLiveClient(d) {
  const activeStreams =
    d.mongoLiveStreams != null
      ? d.mongoLiveStreams
      : (() => {
          const av = d?.gauges?.activeStreams?.values;
          return Array.isArray(av) && av[0] != null ? av[0].value : null;
        })();
  return {
    activeStreams,
    concurrentViewers: d.concurrentViewers != null ? d.concurrentViewers : null,
    generatedAt: d.generatedAt,
  };
}

async function fetchSnapshotHttp(staffUser) {
  const [overview, queues, liveRaw, pay, payoutsRes] = await Promise.all([
    api.adminGetMetricsOverview(),
    api.adminGetMetricsQueuesOps(),
    api.adminGetMetricsLive(),
    api.adminGetMetricsPayments(),
    api.adminGetPayouts('pending', 1, 1),
  ]);

  let fraud = { flaggedUsers: 0, blockedTransactions: 0 };
  if (staffUser?.userId) {
    try {
      const alerts = await api.adminGetFraudAlerts(staffUser, { limit: 200 });
      const list = Array.isArray(alerts) ? alerts : [];
      fraud = {
        flaggedUsers: collectFlaggedUserIds(list).size,
        blockedTransactions: countBlocked(list),
      };
    } catch {
      /* keep zeros */
    }
  }

  return {
    overview,
    queues,
    live: normalizeLiveClient(liveRaw),
    payments: {
      totalVolume: sumCounterValues(pay?.counters?.giftTransactions),
      failedPayments: sumCounterValues(pay?.counters?.paymentErrors),
      payoutsPending: Number(payoutsRes?.total) || 0,
    },
    fraud,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * @param {{ staffUser: object | null }} opts
 * @returns {{ snapshot: object | null, transport: 'connecting'|'ws'|'polling', error: string | null, refresh: () => Promise<void> }}
 */
export function useAdminOpsMetricsSocket({ staffUser }) {
  const [snapshot, setSnapshot] = useState(null);
  const [transport, setTransport] = useState('connecting');
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchSnapshotHttp(staffUser);
      setSnapshot(s);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load metrics');
    }
  }, [staffUser]);

  useEffect(() => {
    let cancelled = false;
    let ws = null;
    let pollId = null;

    const apply = (data) => {
      if (!cancelled && data) {
        setSnapshot(data);
        setError(null);
      }
    };

    const pollOnce = async () => {
      try {
        const s = await fetchSnapshotHttp(staffUser);
        apply(s);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load metrics');
      }
    };

    const startPoll = () => {
      if (pollId != null) return;
      setTransport('polling');
      pollOnce();
      pollId = setInterval(pollOnce, POLL_MS);
    };

    const stopPoll = () => {
      if (pollId != null) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    pollOnce();

    let token = '';
    try {
      token = localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      token = '';
    }

    if (!token) {
      startPoll();
      return () => {
        cancelled = true;
        stopPoll();
      };
    }

    const wsBase = getApiBase().replace(/^http/, 'ws');
    ws = new WebSocket(`${wsBase}/admin/ws?token=${encodeURIComponent(token)}`);

    ws.addEventListener('open', () => {
      if (cancelled) return;
      setTransport('ws');
      stopPoll();
    });

    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.event === 'metrics:update' && msg.data) apply(msg.data);
      } catch {
        /* ignore */
      }
    });

    ws.addEventListener('close', () => {
      if (!cancelled) startPoll();
    });

    ws.addEventListener('error', () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    });

    return () => {
      cancelled = true;
      stopPoll();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [staffUser]);

  return { snapshot, transport, error, refresh };
}
