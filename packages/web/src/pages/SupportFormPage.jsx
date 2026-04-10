/**
 * Support form — report order issue (order ID, tracking, issue type, description).
 * Submits to POST /support. Auth required.
 * https://milloapp.com
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { API_BASE } from '../config/api';

function getToken() {
  try {
    return localStorage.getItem('millo_token') || '';
  } catch {
    return '';
  }
}

function SupportFormContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    orderId: '',
    trackingNumber: '',
    carrier: '',
    issueType: 'NOT_DELIVERED',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const token = getToken();
    if (!token) {
      setError(t('support.loginRequired') || 'Please log in to submit a ticket.');
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/support`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: form.orderId.trim() || undefined,
          trackingNumber: form.trackingNumber.trim() || undefined,
          carrier: form.carrier.trim() || undefined,
          issueType: form.issueType,
          description: form.description.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || t('support.submitFailed') || 'Failed to submit ticket.');
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate('/support/my'), 2000);
    } catch (err) {
      setError(err.message || t('support.submitFailed') || 'Failed to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <>
        <SEO title={t('support.formTitle') || 'Report an Issue'} path="/support/request" />
        <div className="p-6 max-w-xl mx-auto">
          <div className="rounded-xl bg-[var(--success)]/15 text-[var(--success)] p-4 font-medium">
            {t('support.ticketSubmitted') || 'Ticket submitted! We’ll get back to you soon.'}
          </div>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            <Link to="/support/my" className="text-[var(--accent)] hover:underline">
              {t('support.viewMyTickets') || 'View my tickets'}
            </Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title={t('support.formTitle') || 'Report an Issue'} path="/support/request" />
      <div className="p-6 max-w-xl mx-auto">
        <h2 className="text-xl font-bold mb-4 text-[var(--text)]">
          {t('support.reportIssue') || 'Report an Issue'}
        </h2>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
              {t('support.orderId') || 'Order ID'}
            </label>
            <input
              placeholder={t('support.orderIdPlaceholder') || 'Order ID (optional)'}
              value={form.orderId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
              {t('support.trackingNumber') || 'Tracking Number'}
            </label>
            <input
              placeholder={t('support.trackingPlaceholder') || 'Tracking number (optional)'}
              value={form.trackingNumber}
              onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
              {t('support.carrier') || 'Carrier'}
            </label>
            <input
              placeholder="UPS, USPS, FedEx, etc."
              value={form.carrier}
              onChange={(e) => setForm({ ...form, carrier: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
              {t('support.issueType') || 'Issue type'}
            </label>
            <select
              value={form.issueType}
              onChange={(e) => setForm({ ...form, issueType: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
            >
              <option value="NOT_DELIVERED">{t('support.notDelivered') || 'Not Delivered'}</option>
              <option value="DAMAGED">{t('support.damaged') || 'Damaged'}</option>
              <option value="WRONG_ITEM">{t('support.wrongItem') || 'Wrong Item'}</option>
              <option value="OTHER">{t('support.other') || 'Other'}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
              {t('support.description') || 'Describe the issue'}
            </label>
            <textarea
              placeholder={t('support.descriptionPlaceholder') || 'Describe the issue...'}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-[var(--error)]/15 text-[var(--error)] px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60"
            >
              {submitting ? (t('support.submitting') || 'Submitting…') : (t('support.submitTicket') || 'Submit Ticket')}
            </button>
            <Link
              to="/help"
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text)]"
            >
              {t('common.cancel') || 'Cancel'}
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}

export function SupportFormPage() {
  return (
    <ProtectedRoute>
      <SupportFormContent />
    </ProtectedRoute>
  );
}
