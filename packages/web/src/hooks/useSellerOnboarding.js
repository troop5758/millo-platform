import { useEffect, useState, useCallback } from 'react';
import { fetchSellerOnboarding, saveSellerOnboarding } from '../sdk/sellerApi';

export function useSellerOnboarding() {
  const [form, setForm] = useState({
    businessType: '',
    legalName: '',
    country: '',
    taxId: '',
    kycStatus: 'not_started',
    documentsSubmitted: false,
    providerLive: false,
    stripeConnectOffered: false,
    submissionState: 'draft',
    userId: undefined,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchSellerOnboarding();
        if (!active) return;
        setForm((prev) => ({ ...prev, ...(response || {}) }));
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

  const updateField = useCallback((name, value) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await saveSellerOnboarding(form);
      setForm((prev) => ({ ...prev, ...(response || {}) }));
      setSaved(true);
      return response;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [form]);

  return {
    form,
    setForm,
    updateField,
    loading,
    saving,
    saved,
    error,
    save,
  };
}
