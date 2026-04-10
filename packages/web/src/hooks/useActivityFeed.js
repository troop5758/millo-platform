import { useEffect, useState } from 'react';
import { fetchActivityFeed } from '../sdk/activityFeedApi';

export function useActivityFeed(params = {}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchActivityFeed(params);
        if (!active) return;

        setItems(response?.items || []);
        setMeta(response?.meta || {});
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
  }, [JSON.stringify(params)]);

  return {
    items,
    meta,
    loading,
    error,
  };
}
