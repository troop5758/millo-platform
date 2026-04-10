/**
 * Sift Science beacon — Phase 11. Tracks pageviews on route change.
 * Renders nothing. Mount inside App when VITE_SIFT_BEACON_KEY is set.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initSiftBeacon, trackSiftPageview, isSiftEnabled } from '../lib/siftBeacon';
import { getUser } from '../sdk/authApi';

export function SiftBeacon() {
  const location = useLocation();

  useEffect(() => {
    if (!isSiftEnabled()) return;
    const user = getUser();
    const userId = user?._id ?? user?.id ?? null;
    initSiftBeacon(userId);
  }, []);

  useEffect(() => {
    if (!isSiftEnabled()) return;
    const user = getUser();
    const userId = user?._id ?? user?.id ?? null;
    trackSiftPageview(userId);
  }, [location.pathname]);

  return null;
}
