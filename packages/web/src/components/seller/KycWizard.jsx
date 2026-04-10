import React from 'react';
import TrustBadge from '../TrustBadge';

export default function KycWizard({ form, updateField, onSubmit, saving, saved }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-2">Business Type</label>
          <input
            name="businessType"
            value={form.businessType || ''}
            onChange={(e) => updateField('businessType', e.target.value)}
            placeholder="Individual / LLC / Corporation"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-2">Legal Name</label>
          <input
            name="legalName"
            value={form.legalName || ''}
            onChange={(e) => updateField('legalName', e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-2">Country</label>
          <input
            name="country"
            value={form.country || ''}
            onChange={(e) => updateField('country', e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-2">Tax ID</label>
          <input
            name="taxId"
            value={form.taxId || ''}
            onChange={(e) => updateField('taxId', e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
          />
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-[var(--text)]">
        <input
          type="checkbox"
          checked={Boolean(form.documentsSubmitted)}
          onChange={(e) => updateField('documentsSubmitted', e.target.checked)}
        />
        I have submitted identity / business verification documents
      </label>

      <p className="mt-4 text-sm text-[var(--text-muted)]">
        Current KYC status: <strong className="text-[var(--text)]">{form.kycStatus || 'not_started'}</strong>
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[var(--accent)] text-white px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save and Continue'}
        </button>
        {saved ? <span className="text-green-600 text-sm">Saved successfully.</span> : null}
      </div>
    </form>
  );
}
