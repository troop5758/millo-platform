/**
 * Support dashboard — TikTok-style: header + KPI cards + search/filters + ticket table + detail panel.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useStaffAuth } from '../context/StaffAuth';
import {
  IconBack,
  IconTicket,
  IconRefund,
  IconUser,
  IconRefresh,
  IconSearch,
  IconHeadphones,
  IconStar,
  IconArrowDown,
  IconClose,
  IconPlusCircle,
} from '../components/StaffIcons';
import * as api from '../sdk/dashboardsApi';

function PriorityBadge({ priority }) {
  const { t } = useTranslation();
  const p = (priority || '').toLowerCase();
  if (p === 'high' || p === 'critical') return <span className="text-[var(--staff-error)] flex items-center gap-1"><span className="inline-block w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-current" /> {t('support.priorityHigh')}</span>;
  if (p === 'resolved') return <span className="text-[var(--staff-success)] flex items-center gap-1">{t('support.priorityResolved')}</span>;
  return <span className="text-[var(--staff-text-muted)]">{t('support.priorityOpen')}</span>;
}

function SupportContent() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const KPI_CARDS = [
    { key: 'active',    label: t('support.kpiActiveTickets'), icon: IconHeadphones, value: '42',  trend: '0:52', trendDown: true },
    { key: 'resolved',  label: t('support.kpiResolved'),      icon: IconPlusCircle, value: '18m', status: t('support.kpiInProgress'), statusGreen: true },
    { key: 'priority',  label: t('support.kpiPriority'),      icon: IconStar,       value: '94%', status: t('support.kpiInProgress'), statusGreen: true },
    { key: 'close',     label: t('support.kpiCloseTicket'),   icon: IconTicket,     value: '',    status: t('support.kpiInProgress'), statusGreen: true },
  ];
  const [tickets, setTickets] = useState([]);
  const [ticketStatus, setTicketStatus] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [createUserId, setCreateUserId] = useState('');
  const [createSubject, setCreateSubject] = useState('');
  const [refundUserId, setRefundUserId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [lookupUserId, setLookupUserId] = useState('');
  const [lookupUser, setLookupUser] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const loadTickets = useCallback(async () => {
    try {
      const list = await api.supportTicketsList(staffUser, ticketStatus || undefined, 50);
      setTickets(Array.isArray(list) ? list : []);
    } catch (e) {
      showMsg('err', e.message || t('support.failedLoad'));
    }
  }, [staffUser, ticketStatus]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!createUserId.trim() || !createSubject.trim()) {
      showMsg('err', t('support.userIdRequired'));
      return;
    }
    try {
      await api.supportTicketCreate(staffUser, createUserId.trim(), createSubject.trim());
      showMsg('ok', t('support.ticketCreated'));
      setCreateUserId('');
      setCreateSubject('');
      loadTickets();
    } catch (e) {
      showMsg('err', e.message || t('support.failed'));
    }
  };

  const handleRefund = async (e) => {
    e.preventDefault();
    const amountCents = parseInt(refundAmount, 10);
    if (!refundUserId.trim() || !Number.isFinite(amountCents)) {
      showMsg('err', t('support.userIdAmountRequired'));
      return;
    }
    try {
      await api.supportRefund(staffUser, refundUserId.trim(), amountCents, refundReason || undefined);
      showMsg('ok', t('support.refundLogged'));
      setRefundUserId('');
      setRefundAmount('');
      setRefundReason('');
    } catch (e) {
      showMsg('err', e.message || t('support.failed'));
    }
  };

  const handleLookupUser = async (e) => {
    e.preventDefault();
    if (!lookupUserId.trim()) return;
    setLookupUser(null);
    try {
      const user = await api.supportUserTools(staffUser, 'getUser', { userId: lookupUserId.trim() });
      setLookupUser(user);
    } catch (e) {
      showMsg('err', e.message || t('support.userNotFound'));
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!String(t.subject || '').toLowerCase().includes(q) &&
          !String(t.userId || '').toLowerCase().includes(q) &&
          !String(t._id || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <SEO title={t('support.title')} description={t('support.desc')} path="/support" />
      <div className="staff-dashboard min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Header: title + description + Refresh */}
          <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[var(--staff-text)]">{t('support.title')}</h1>
              <p className="text-sm text-[var(--staff-text-muted)] mt-0.5">{t('support.desc')}</p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2 text-sm text-[var(--staff-text-muted)] hover:text-[var(--staff-text)]">
                <IconBack className="w-5 h-5" />
                {t('common.home')}
              </Link>
              <button type="button" onClick={loadTickets} className="staff-btn-primary inline-flex items-center gap-2">
                <IconRefresh className="w-5 h-5" />
                {t('support.refresh')}
              </button>
            </div>
          </header>

          {message.text && (
            <div
              className={`mb-4 p-3 rounded-xl text-sm font-medium ${
                message.type === 'err' ? 'bg-[var(--staff-error)]/15 text-[var(--staff-error)]' : 'bg-[var(--staff-success)]/15 text-[var(--staff-success)]'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* KPI cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {KPI_CARDS.map(({ key, label, icon: Icon, value, trend, trendDown, status, statusGreen }) => (
              <div key={key} className="staff-card flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className={key === 'priority' ? 'text-[var(--staff-warning)]' : 'text-[var(--staff-text-muted)]'}>
                    <Icon className="w-5 h-5" />
                  </span>
                  {trend != null && (
                    <span className={`text-xs flex items-center gap-0.5 ${trendDown ? 'text-[var(--staff-error)]' : 'text-[var(--staff-text-muted)]'}`}>
                      {trendDown && <IconArrowDown className="w-3 h-3" />}
                      {trend}
                    </span>
                  )}
                </div>
                {value && <span className="text-xl font-bold text-[var(--staff-text)]">{value}</span>}
                <span className="text-sm font-medium text-[var(--staff-text)]">{label}</span>
                {status && <span className={`text-xs ${statusGreen ? 'text-[var(--staff-success)]' : 'text-[var(--staff-text-muted)]'}`}>{status}</span>}
              </div>
            ))}
          </section>

          {/* Search + filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex-1 min-w-[200px] relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--staff-text-muted)]" />
              <input
                type="text"
                placeholder={t('support.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="staff-input pl-10"
              />
            </div>
            <select value={ticketStatus} onChange={(e) => setTicketStatus(e.target.value)} className="staff-select min-w-[140px]">
              <option value="">{t('support.allStatus')}</option>
              <option value="open">{t('support.open')}</option>
              <option value="closed">{t('support.closed')}</option>
            </select>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="staff-select min-w-[140px]">
              <option value="">{t('support.allPriority')}</option>
              <option value="high">{t('support.high')}</option>
              <option value="open">{t('support.open')}</option>
              <option value="resolved">{t('support.resolved')}</option>
            </select>
          </div>

          {/* Ticket table */}
          <div className="staff-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="table-dark">
                <thead>
                  <tr>
                    <th>{t('support.colId')}</th>
                    <th>{t('support.colCustomer')}</th>
                    <th>{t('support.colSubject')}</th>
                    <th>{t('support.colPriority')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-[var(--staff-text-muted)] text-center py-8">{t('support.noTickets')}</td>
                    </tr>
                  )}
                  {filteredTickets.map((t) => (
                    <tr key={`${t.ticketSource || 'ticket'}-${String(t._id)}`} className="cursor-pointer" onClick={() => setSelectedTicket(t)}>
                      <td className="font-medium">T-{String(t._id).slice(-4)}</td>
                      <td>
                        <span className="text-[var(--staff-text)]">{t.userId}</span>
                        <span className="text-[var(--staff-text-muted)] text-xs block">—</span>
                      </td>
                      <td>{t.subject || '—'}</td>
                      <td><PriorityBadge priority={t.priority || (t.status === 'closed' ? 'resolved' : 'open')} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create ticket + Refund + User lookup (collapsible or below table) */}
          <details className="staff-card mt-6">
            <summary className="cursor-pointer font-semibold text-[var(--staff-text)]">{t('support.actions')}</summary>
            <div className="mt-4 space-y-6">
              <form onSubmit={handleCreateTicket} className="flex flex-wrap gap-2">
                <input type="text" placeholder={t('support.userIdPlaceholder')} value={createUserId} onChange={(e) => setCreateUserId(e.target.value)} className="staff-input min-w-[10rem] flex-1" />
                <input type="text" placeholder={t('support.subjectPlaceholder')} value={createSubject} onChange={(e) => setCreateSubject(e.target.value)} className="staff-input min-w-[12rem] flex-1" />
                <button type="submit" className="staff-btn-primary">{t('support.createTicket')}</button>
              </form>
              <form onSubmit={handleRefund} className="flex flex-wrap gap-2">
                <input type="text" placeholder={t('support.userIdPlaceholder')} value={refundUserId} onChange={(e) => setRefundUserId(e.target.value)} className="staff-input min-w-[10rem]" />
                <input type="number" placeholder={t('support.amountPlaceholder')} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="staff-input w-32" />
                <input type="text" placeholder={t('support.reasonPlaceholder')} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} className="staff-input min-w-[12rem]" />
                <button type="submit" className="staff-btn-primary">{t('support.refundRequest')}</button>
              </form>
              <form onSubmit={handleLookupUser} className="flex flex-wrap gap-2">
                <input type="text" placeholder={t('support.userIdPlaceholder')} value={lookupUserId} onChange={(e) => setLookupUserId(e.target.value)} className="staff-input flex-1 min-w-[12rem]" />
                <button type="submit" className="staff-btn-primary">{t('support.lookUp')}</button>
              </form>
              {lookupUser && (
                <pre className="text-sm text-[var(--staff-text-muted)] overflow-auto p-4 rounded-xl" style={{ backgroundColor: 'var(--staff-bg-elevated)' }}>{JSON.stringify(lookupUser, null, 2)}</pre>
              )}
            </div>
          </details>
        </div>

        {/* Detail panel overlay */}
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedTicket(null)} aria-hidden />
            <div className="relative w-full max-w-md bg-[var(--staff-bg-card)] border-l border-[var(--staff-border)] shadow-xl overflow-y-auto p-6 rounded-l-xl">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg font-bold text-[var(--staff-text)]">T-{String(selectedTicket._id).slice(-4)}</h2>
                  <p className="text-[var(--staff-text)] font-medium mt-1">{selectedTicket.subject || 'Payment not processing'}</p>
                </div>
                <button type="button" onClick={() => setSelectedTicket(null)} className="p-2 rounded-full bg-[var(--staff-bg-elevated)] text-[var(--staff-text)] hover:bg-[var(--staff-border)]">
                  <IconClose className="w-5 h-5" />
                </button>
              </div>
              <div className="flex gap-2 mb-4">
                <span className="pill-tag">{t('support.priorityCritical')}</span>
                <span className="pill-tag pill-tag-success">{t('support.statusInProgress')}</span>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[var(--staff-bg-elevated)] flex items-center justify-center text-[var(--staff-text-muted)]">
                  <IconUser className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--staff-text)]">{selectedTicket.userId || 'jodonde'}</p>
                  <p className="text-xs text-[var(--staff-text-muted)]">45 min ago</p>
                </div>
              </div>
              <p className="text-sm text-[var(--staff-text-muted)] mb-2">{t('support.category')}</p>
              <p className="text-sm text-[var(--staff-text)] mb-4">payment</p>
              <p className="text-sm text-[var(--staff-text-muted)] mb-1">{t('support.customerTime')}</p>
              <div className="flex gap-0.5 mb-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <IconStar key={i} className="w-5 h-5" filled={i <= 4} style={i <= 4 ? { color: 'var(--staff-warning)' } : { color: 'var(--staff-text-muted)' }} />
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" className="staff-btn-secondary flex-1">{t('support.cancel')}</button>
                <button type="button" className="staff-btn-primary flex-1">{t('support.reply')}</button>
                <button type="button" className="staff-btn-secondary flex-1">{t('support.closeTicket')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function SupportPage() {
  return (
    <ProtectedRoute requireRole="support">
      <SupportContent />
    </ProtectedRoute>
  );
}
