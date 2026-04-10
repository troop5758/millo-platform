/**
 * DMCA page — takedown notice form (public) and counter-notice form (logged-in uploaders).
 * Posts to POST /legal/dmca/takedown-notice and POST /legal/dmca/counter-notice.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { useAuth } from '../sdk/authApi';
import { API_BASE } from '../config/api';
import {
  getDmcaAgent,
  submitTakedownNotice,
  submitCounterNotice,
} from '../sdk/legalApi';

const TARGET_TYPES = [
  { value: 'stream', label: 'Live stream / VOD' },
  { value: 'content', label: 'Content' },
  { value: 'event', label: 'Event' },
  { value: 'product', label: 'Product' },
];

function Field({ label, required, children, id }) {
  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[var(--text)] mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

export function DmcaPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState('takedown');
  const [agent, setAgent] = useState(null);

  // Takedown form state
  const [claimantName, setClaimantName] = useState('');
  const [claimantEmail, setClaimantEmail] = useState('');
  const [claimantAddress, setClaimantAddress] = useState('');
  const [signature, setSignature] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [workUrl, setWorkUrl] = useState('');
  const [targetType, setTargetType] = useState('stream');
  const [targetId, setTargetId] = useState('');
  const [infringingUrlsText, setInfringingUrlsText] = useState('');
  const [goodFaithStatement, setGoodFaithStatement] = useState('');
  const [accuracyStatement, setAccuracyStatement] = useState('');
  const [takedownSubmit, setTakedownSubmit] = useState({ loading: false, error: '', success: false });

  // Counter-notice form state
  const [noticeId, setNoticeId] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerAddress, setSignerAddress] = useState('');
  const [counterGoodFaith, setCounterGoodFaith] = useState('');
  const [consentToJurisdiction, setConsentToJurisdiction] = useState(false);
  const [counterSubmit, setCounterSubmit] = useState({ loading: false, error: '', success: false });

  useEffect(() => {
    getDmcaAgent().then(setAgent).catch(() => setAgent(null));
  }, []);

  const copyrightPolicyUrl = `${API_BASE}/legal/copyright.html`;

  const handleTakedownSubmit = async (e) => {
    e.preventDefault();
    setTakedownSubmit({ loading: true, error: '', success: false });
    const infringingUrls = infringingUrlsText.trim() ? infringingUrlsText.trim().split(/\n/).map((u) => u.trim()).filter(Boolean) : [];
    try {
      await submitTakedownNotice({
        claimantName: claimantName.trim(),
        claimantEmail: claimantEmail.trim(),
        claimantAddress: claimantAddress.trim() || undefined,
        signature: signature.trim() || undefined,
        workDescription: workDescription.trim(),
        workUrl: workUrl.trim() || undefined,
        targetType,
        targetId: targetId.trim(),
        infringingUrls: infringingUrls.length ? infringingUrls : undefined,
        goodFaithStatement: goodFaithStatement.trim() || undefined,
        accuracyStatement: accuracyStatement.trim() || undefined,
      });
      setTakedownSubmit({ loading: false, error: '', success: true });
      setClaimantName('');
      setClaimantEmail('');
      setClaimantAddress('');
      setSignature('');
      setWorkDescription('');
      setWorkUrl('');
      setTargetId('');
      setInfringingUrlsText('');
      setGoodFaithStatement('');
      setAccuracyStatement('');
    } catch (err) {
      setTakedownSubmit({ loading: false, error: err.message || 'Submission failed', success: false });
    }
  };

  const handleCounterSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setCounterSubmit({ loading: true, error: '', success: false });
    try {
      await submitCounterNotice({
        noticeId: noticeId.trim(),
        signerName: signerName.trim(),
        signerEmail: signerEmail.trim(),
        signerAddress: signerAddress.trim() || undefined,
        goodFaithStatement: counterGoodFaith.trim() || undefined,
        consentToJurisdiction: consentToJurisdiction,
      });
      setCounterSubmit({ loading: false, error: '', success: true });
      setNoticeId('');
      setSignerName('');
      setSignerEmail('');
      setSignerAddress('');
      setCounterGoodFaith('');
      setConsentToJurisdiction(false);
    } catch (err) {
      setCounterSubmit({ loading: false, error: err.message || 'Submission failed', success: false });
    }
  };

  const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]';
  const textareaClass = inputClass + ' min-h-[80px] resize-y';

  return (
    <>
      <SEO
        title={t('dmca.title', 'DMCA — Copyright & Takedown')}
        description={t('dmca.seoDesc', 'Submit a DMCA takedown notice or counter-notice.')}
        path="/legal/dmca"
      />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[var(--text)]">
          {t('dmca.title', 'DMCA — Copyright & Takedown')}
        </h1>
        <p className="text-[var(--text-muted)] mt-1 text-sm">
          {t('dmca.intro', 'Submit a takedown notice if you believe content on Millo infringes your copyright. If you are the uploader and believe a takedown was mistaken, you may submit a counter-notice when logged in.')}
        </p>
        <p className="mt-2 text-sm">
          <a href={copyrightPolicyUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
            {t('dmca.viewPolicy', 'View full Copyright & DMCA Policy')}
          </a>
        </p>
        {agent && (
          <div className="mt-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--text-muted)]">
            <p className="font-medium text-[var(--text)]">{t('dmca.designatedAgent', 'Designated DMCA Agent')}</p>
            <p>{agent.name}</p>
            <p>{agent.address}</p>
            <a href={`mailto:${agent.email}`} className="text-[var(--accent)] hover:underline">{agent.email}</a>
          </div>
        )}

        {/* Tabs */}
        <div className="mt-8 flex gap-2 border-b border-[var(--border)]">
          <button
            type="button"
            onClick={() => setTab('takedown')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'takedown' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'}`}
          >
            {t('dmca.takedownTab', 'Takedown notice')}
          </button>
          {user && (
            <button
              type="button"
              onClick={() => setTab('counter')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'counter' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            >
              {t('dmca.counterTab', 'Counter-notice')}
            </button>
          )}
        </div>

        {tab === 'takedown' && (
          <form onSubmit={handleTakedownSubmit} className="mt-6">
            <p className="text-sm text-[var(--text-muted)] mb-4">
              {t('dmca.takedownDesc', 'Only the copyright owner or an authorized agent may submit a takedown notice. False claims may result in liability.')}
            </p>
            {takedownSubmit.success && (
              <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-sm">
                {t('dmca.takedownSuccess', 'Your takedown notice has been received. We will review it and respond in accordance with the DMCA.')}
              </div>
            )}
            {takedownSubmit.error && (
              <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
                {takedownSubmit.error}
              </div>
            )}
            <Field label={t('dmca.claimantName', 'Your full name (claimant)')} required id="claimantName">
              <input id="claimantName" type="text" className={inputClass} value={claimantName} onChange={(e) => setClaimantName(e.target.value)} required />
            </Field>
            <Field label={t('dmca.claimantEmail', 'Your email')} required id="claimantEmail">
              <input id="claimantEmail" type="email" className={inputClass} value={claimantEmail} onChange={(e) => setClaimantEmail(e.target.value)} required />
            </Field>
            <Field label={t('dmca.claimantAddress', 'Your physical address')} id="claimantAddress">
              <input id="claimantAddress" type="text" className={inputClass} value={claimantAddress} onChange={(e) => setClaimantAddress(e.target.value)} />
            </Field>
            <Field label={t('dmca.signature', 'Electronic signature (type your full name)')} id="signature">
              <input id="signature" type="text" className={inputClass} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={t('dmca.signaturePlaceholder', 'Full legal name')} />
            </Field>
            <Field label={t('dmca.workDescription', 'Description of the copyrighted work')} required id="workDescription">
              <textarea id="workDescription" className={textareaClass} value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} required />
            </Field>
            <Field label={t('dmca.workUrl', 'URL of the original work (if any)')} id="workUrl">
              <input id="workUrl" type="url" className={inputClass} value={workUrl} onChange={(e) => setWorkUrl(e.target.value)} placeholder="https://" />
            </Field>
            <Field label={t('dmca.targetType', 'Type of infringing content')} required id="targetType">
              <select id="targetType" className={inputClass} value={targetType} onChange={(e) => setTargetType(e.target.value)}>
                {TARGET_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label={t('dmca.targetId', 'Content ID (stream/content/event/product ID on our platform)')} required id="targetId">
              <input id="targetId" type="text" className={inputClass} value={targetId} onChange={(e) => setTargetId(e.target.value)} required placeholder="e.g. stream ObjectId" />
            </Field>
            <Field label={t('dmca.infringingUrls', 'Infringing URLs (one per line, optional)')} id="infringingUrls">
              <textarea id="infringingUrls" className={textareaClass} value={infringingUrlsText} onChange={(e) => setInfringingUrlsText(e.target.value)} placeholder="https://..." />
            </Field>
            <Field label={t('dmca.goodFaith', 'Good faith statement (optional)')} id="goodFaith">
              <textarea id="goodFaith" className={textareaClass} value={goodFaithStatement} onChange={(e) => setGoodFaithStatement(e.target.value)} />
            </Field>
            <Field label={t('dmca.accuracy', 'Accuracy under penalty of perjury (optional)')} id="accuracy">
              <textarea id="accuracy" className={textareaClass} value={accuracyStatement} onChange={(e) => setAccuracyStatement(e.target.value)} />
            </Field>
            <button type="submit" disabled={takedownSubmit.loading} className="mt-4 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
              {takedownSubmit.loading ? t('dmca.submitting', 'Submitting…') : t('dmca.submitTakedown', 'Submit takedown notice')}
            </button>
          </form>
        )}

        {tab === 'counter' && user && (
          <form onSubmit={handleCounterSubmit} className="mt-6">
            <p className="text-sm text-[var(--text-muted)] mb-4">
              {t('dmca.counterDesc', 'If you are the uploader of the content that was taken down and you believe the takedown was mistaken, you may submit a counter-notice. You must be logged in as the content owner.')}
            </p>
            {counterSubmit.success && (
              <div className="mb-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-sm">
                {t('dmca.counterSuccess', 'Your counter-notice has been received. The claimant has been notified. Content may be restored after the statutory period if no court action is filed.')}
              </div>
            )}
            {counterSubmit.error && (
              <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm">
                {counterSubmit.error}
              </div>
            )}
            <Field label={t('dmca.noticeId', 'DMCA notice ID')} required id="noticeId">
              <input id="noticeId" type="text" className={inputClass} value={noticeId} onChange={(e) => setNoticeId(e.target.value)} required placeholder="e.g. 507f1f77bcf86cd799439011" />
            </Field>
            <Field label={t('dmca.signerName', 'Your full name')} required id="signerName">
              <input id="signerName" type="text" className={inputClass} value={signerName} onChange={(e) => setSignerName(e.target.value)} required />
            </Field>
            <Field label={t('dmca.signerEmail', 'Your email')} required id="signerEmail">
              <input id="signerEmail" type="email" className={inputClass} value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} required />
            </Field>
            <Field label={t('dmca.signerAddress', 'Your physical address')} id="signerAddress">
              <input id="signerAddress" type="text" className={inputClass} value={signerAddress} onChange={(e) => setSignerAddress(e.target.value)} />
            </Field>
            <Field label={t('dmca.counterGoodFaith', 'Good faith statement (optional)')} id="counterGoodFaith">
              <textarea id="counterGoodFaith" className={textareaClass} value={counterGoodFaith} onChange={(e) => setCounterGoodFaith(e.target.value)} />
            </Field>
            <div className="mb-4 flex items-start gap-3">
              <input
                id="consent"
                type="checkbox"
                checked={consentToJurisdiction}
                onChange={(e) => setConsentToJurisdiction(e.target.checked)}
                className="mt-1 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              <label htmlFor="consent" className="text-sm text-[var(--text)]">
                {t('dmca.consentJurisdiction', 'I consent to the jurisdiction of the federal court for my district (or if outside the U.S., any judicial district in which we may be found).')}
              </label>
            </div>
            <button type="submit" disabled={counterSubmit.loading} className="mt-4 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
              {counterSubmit.loading ? t('dmca.submitting', 'Submitting…') : t('dmca.submitCounter', 'Submit counter-notice')}
            </button>
          </form>
        )}

        {tab === 'counter' && !user && (
          <div className="mt-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] text-sm">
            <p>{t('dmca.loginRequired', 'You must be logged in to submit a counter-notice.')}</p>
            <Link to="/login" className="mt-2 inline-block text-[var(--accent)] hover:underline font-medium">{t('nav.login', 'Log in')}</Link>
          </div>
        )}
      </div>
    </>
  );
}
