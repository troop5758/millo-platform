import { useEffect, useState } from 'react';
import { fetchDisputes } from '../sdk/disputesApi';

/**
 * @param {object} [params] query (limit, status)
 * @param {{ admin?: boolean }} [options] — admin list uses GET /admin/disputes
 */
export function useDisputes(params = {}, options = {}) {
  const { admin = false } = options;
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
        const response = await fetchDisputes(params, { admin });
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
  }, [JSON.stringify(params), admin]);

  return {
    items,
    meta,
    loading,
    error,
  };
}
