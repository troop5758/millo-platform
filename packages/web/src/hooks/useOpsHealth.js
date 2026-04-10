import { useEffect, useState } from 'react';
import { fetchOpsHealth, fetchWorkerHealth, fetchQueueStats } from '../sdk/opsApi';

export function useOpsHealth(fetcher) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetcher();
        if (!active) return;
        setData(response);
      } catch (err) {
        if (!active) return;
        setError(err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [fetcher]);

  return { data, loading, error };
}

export function useOpsHealthSummary() {
  return useOpsHealth(fetchOpsHealth);
}

export function useWorkerHealth() {
  return useOpsHealth(fetchWorkerHealth);
}

export function useQueueStats() {
  return useOpsHealth(fetchQueueStats);
}
