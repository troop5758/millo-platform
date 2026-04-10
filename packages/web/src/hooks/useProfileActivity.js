import { useEffect, useState } from 'react';
import { fetchProfileActivity } from '../sdk/activityFeedApi';

export function useProfileActivity(userId, params = {}) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setMeta({});
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchProfileActivity(userId, params);
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
  }, [userId, JSON.stringify(params)]);

  return {
    items,
    meta,
    loading,
    error,
  };
}
