/**
 * Control plane `live` object — streaming + filters (GET /api/system/control-plane).
 * https://milloapp.com
 */
import { useState, useEffect } from 'react';
import { fetchControlPlaneSnapshot } from '../sdk/controlPlaneApi';

/**
 * @returns {{ streaming: string, filters: string }|null} null while loading or on error
 */
export function useLiveCapability() {
  const [live, setLive] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchControlPlaneSnapshot()
      .then((s) => {
        if (!cancelled) setLive(s?.live && typeof s.live === 'object' ? s.live : null);
      })
      .catch(() => {
        if (!cancelled) setLive(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { live, loaded };
}
