import { useEffect, useState, useCallback } from 'react';
import { fetchAIControls, updateAIControls } from '../sdk/aiAdminApi';

export function useAIControls() {
  const [controls, setControls] = useState({
    shadowMode: false,
    moderationEnabled: true,
    autoActionEnabled: false,
    modelVersion: '',
    aiOptimizationEnabled: true,
    rankingInjectionActive: false,
    adsAiOptimizationActive: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  /** True after server returns 501 (legacy read-only API); cleared on successful save. */
  const [readOnlyPersist, setReadOnlyPersist] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchAIControls();
        if (!active) return;
        setControls((prev) => ({ ...prev, ...(response || {}) }));
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
  }, []);

  const toggle = useCallback((key) => {
    setSaved(false);
    setControls((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setValue = useCallback((key, value) => {
    setSaved(false);
    setControls((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const response = await updateAIControls(controls);
      setControls((prev) => ({ ...prev, ...(response || {}) }));
      setSaved(true);
      setReadOnlyPersist(false);
      return response;
    } catch (err) {
      // Legacy: PUT returned 501 + JSON body with `current` env snapshot.
      if (err.status === 501 && err.body?.current && typeof err.body.current === 'object') {
        setControls((prev) => ({ ...prev, ...err.body.current }));
        setSaved(false);
        setReadOnlyPersist(true);
        setError(
          new Error(
            err.body.message ||
              'AI toggles are read-only in this deployment; values were reset from the server environment.'
          )
        );
        return err.body;
      }
      setError(err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [controls]);

  return {
    controls,
    loading,
    saving,
    saved,
    error,
    readOnlyPersist,
    toggle,
    setValue,
    save,
  };
}
