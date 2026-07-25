import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Users, UserPlus, Shield, ShieldCheck, Trash2, Mail, Send, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import HelpTooltip from './HelpTooltip';
import { formatDate, formatDateTime } from '../utils/formatters';

const AdultsTab = ({ user, isOwner, addToast }) => {
  const { t, i18n } = useTranslation(['family', 'common', 'tooltips', 'errors']);
  const [adults, setAdults] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [pendingTransfer, setPendingTransfer] = useState(null);
  const [loading, setLoading] = useState(true);

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', inviteeName: '', message: '' });
  const [inviteLoading, setInviteLoading] = useState(false);

  // Transfer Ownership Modal State
  const [showTransferModal, setShowTransferModal] = useState(null); // target adult user object
  const [transferLoading, setTransferLoading] = useState(false);

  // Delete Adult Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(null); // target adult user object
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchAdultsData();
  }, []);

  const fetchAdultsData = async () => {
    try {
      setLoading(true);
      const [adultsRes, invitesRes, transferRes] = await Promise.all([
        axios.get('/family/adults'),
        axios.get('/family/adults/invitations'),
        axios.get('/family/ownership-transfers/pending')
      ]);

      setAdults(adultsRes.data || []);
      setInvitations(invitesRes.data || []);
      setPendingTransfer(transferRes.data?.pendingTransfer || null);
    } catch (err) {
      addToast(err.response?.data?.error || t('common:noData'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.inviteeName) {
      return addToast(t('common:unknown'), 'error');
    }

    try {
      setInviteLoading(true);
      await axios.post('/family/adults/invitations', inviteForm);
      addToast(t('family:inviteAdult') + ' ' + t('common:status.approved'), 'success');
      setShowInviteModal(false);
      setInviteForm({ email: '', inviteeName: '', message: '' });
      fetchAdultsData();
    } catch (err) {
      addToast(err.response?.data?.error || t('common:unknown'), 'error');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleResendInvite = async (invitationId) => {
    try {
      await axios.post(`/family/adults/invitations/${invitationId}/resend`);
      addToast(t('common:actions.send'), 'success');
      fetchAdultsData();
    } catch (err) {
      addToast(err.response?.data?.error || t('common:unknown'), 'error');
    }
  };

  const handleRevokeInvite = async (invitationId) => {
    if (!window.confirm(t('common:actions.delete') + '?')) return;
    try {
      await axios.delete(`/family/adults/invitations/${invitationId}`);
      addToast(t('common:actions.delete'), 'success');
      fetchAdultsData();
    } catch (err) {
      addToast(err.response?.data?.error || t('common:unknown'), 'error');
    }
  };

  const handleInitiateTransfer = async () => {
    if (!showTransferModal) return;
    try {
      setTransferLoading(true);
      await axios.post('/family/ownership-transfers', { toUserId: showTransferModal.id });
      addToast(t('family:transferOwnership'), 'success');
      setShowTransferModal(null);
      fetchAdultsData();
    } catch (err) {
      addToast(err.response?.data?.error || t('common:unknown'), 'error');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleAcceptTransfer = async () => {
    if (!pendingTransfer) return;
    try {
      await axios.post(`/family/ownership-transfers/${pendingTransfer.id}/accept`);
      addToast(t('common:status.accepted'), 'success');
      window.location.reload();
    } catch (err) {
      addToast(err.response?.data?.error || t('common:unknown'), 'error');
    }
  };

  const handleRejectTransfer = async () => {
    if (!pendingTransfer) return;
    try {
      await axios.post(`/family/ownership-transfers/${pendingTransfer.id}/reject`);
      addToast(t('common:status.rejected'), 'info');
      fetchAdultsData();
    } catch (err) {
      addToast(err.response?.data?.error || t('common:unknown'), 'error');
    }
  };

  const handleCancelTransfer = async () => {
    if (!pendingTransfer) return;
    try {
      await axios.post(`/family/ownership-transfers/${pendingTransfer.id}/cancel`);
      addToast(t('common:actions.cancel'), 'info');
      fetchAdultsData();
    } catch (err) {
      addToast(err.response?.data?.error || t('common:unknown'), 'error');
    }
  };

  const handleDeleteAdult = async () => {
    if (!showDeleteModal) return;
    try {
      setDeleteLoading(true);
      await axios.delete(`/family/adults/${showDeleteModal.id}`);
      addToast(t('common:actions.delete'), 'success');
      setShowDeleteModal(null);
      fetchAdultsData();
    } catch (err) {
      addToast(err.response?.data?.error || t('common:unknown'), 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">{t('common:loading')}</div>;
  }

  const locale = i18n.language || 'ru';

  return (
    <div className="space-y-6">
      
      {/* Pending Ownership Transfer Alert Banner */}
      {pendingTransfer && (
        <div className="bg-amber-950/60 border border-amber-800/80 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-900/60 text-amber-300 rounded-lg shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-md font-semibold text-amber-200">
                {t('family:transferOwnership')}
              </h3>
              <p className="text-sm text-amber-300/80 mt-0.5">
                {pendingTransfer.isForMe
                  ? `${pendingTransfer.fromName} -> ${t('common:roles.family_owner')}`
                  : `${pendingTransfer.toName} (${t('common:status.pending')}: ${formatDateTime(pendingTransfer.expiresAt, locale)})`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pendingTransfer.isForMe ? (
              <>
                <button
                  onClick={handleAcceptTransfer}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow cursor-pointer"
                >
                  {t('common:actions.confirm')}
                </button>
                <button
                  onClick={handleRejectTransfer}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  {t('common:actions.reject')}
                </button>
              </>
            ) : (
              (isOwner || pendingTransfer.isInitiatedByMe) && (
                <button
                  onClick={handleCancelTransfer}
                  className="px-4 py-2 bg-red-950/80 hover:bg-red-900/80 text-red-200 border border-red-800/60 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  {t('common:actions.cancel')}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Adult Members List Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              {t('family:adults')}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t('family:members')}
            </p>
          </div>

          {isOwner && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition shadow cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              {t('family:inviteAdult')}
            </button>
          )}
        </div>

        {/* Members Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {adults.map((adult) => (
            <div
              key={adult.id}
              className={`p-4 rounded-xl border transition ${
                adult.isOwner
                  ? 'bg-indigo-950/30 border-indigo-800/60'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-base ${adult.isOwner ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                    {adult.displayName ? adult.displayName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">{adult.displayName}</span>
                      {adult.isOwner ? (
                        <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded-md text-[10px] font-medium flex items-center gap-1">
                          <Shield className="w-3 h-3 text-indigo-400" />
                          {t('common:roles.family_owner')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md text-[10px] font-medium">
                          {t('common:roles.family_adult')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{adult.email}</div>
                  </div>
                </div>

                {isOwner && !adult.isOwner && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTransferModal(adult)}
                      className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 rounded-lg text-xs font-medium transition cursor-pointer"
                      title={t('family:transferOwnership')}
                    >
                      {t('family:transferOwnership')}
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(adult)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition cursor-pointer"
                      title={t('common:actions.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                <div>{formatDate(adult.joinedAt, locale)}</div>
                <div>{t('common:nav.banks')}: <span className="text-slate-200 font-mono">{adult.banksCreatedCount}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invitations Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-md font-semibold text-white flex items-center gap-2">
          <Mail className="w-4 h-4 text-indigo-400" />
          {t('family:inviteAdult')}
        </h3>

        {invitations.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            {t('common:noData')}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">{t('family:fields.displayName')}</th>
                  <th className="py-2.5 px-3">{t('family:fields.email')}</th>
                  <th className="py-2.5 px-3">{t('audit:columns.event')}</th>
                  <th className="py-2.5 px-3">{t('audit:columns.time')}</th>
                  <th className="py-2.5 px-3">{t('audit:columns.time')}</th>
                  {isOwner && <th className="py-2.5 px-3 text-right">{t('audit:columns.details')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {invitations.map((inv) => {
                  let statusLabel = t('common:status.pending');
                  let statusBadge = 'bg-amber-950 text-amber-300 border-amber-800';
                  if (inv.accepted_at) {
                    statusLabel = t('common:status.accepted');
                    statusBadge = 'bg-emerald-950 text-emerald-300 border-emerald-800';
                  } else if (inv.revoked_at) {
                    statusLabel = t('common:status.rejected');
                    statusBadge = 'bg-slate-800 text-slate-400 border-slate-700';
                  } else if (new Date(inv.expires_at) < new Date()) {
                    statusLabel = t('common:status.expired');
                    statusBadge = 'bg-red-950 text-red-400 border-red-800';
                  }

                  const canAct = isOwner && !inv.accepted_at && !inv.revoked_at;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-medium text-slate-200">{inv.invitee_name}</td>
                      <td className="py-2.5 px-3 text-slate-400">{inv.email_normalized}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block px-2 py-0.5 border rounded-full font-medium text-[10px] ${statusBadge}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {formatDate(inv.created_at, locale)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {formatDate(inv.expires_at, locale)}
                      </td>
                      {isOwner && (
                        <td className="py-2.5 px-3 text-right">
                          {canAct ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleResendInvite(inv.id)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] transition cursor-pointer"
                              >
                                {t('common:actions.send')}
                              </button>
                              <button
                                onClick={() => handleRevokeInvite(inv.id)}
                                className="px-2 py-1 bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800/50 rounded text-[11px] transition cursor-pointer"
                              >
                                {t('common:actions.cancel')}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Invite Adult */}
      {showInviteModal && (
        <div className="modal-overlay">
          <div className="modal-content large-modal">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                {t('family:inviteAdult')}
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="close-btn"
                aria-label={t('common:actions.close')}
              >
                &times;
              </button>
            </div>

            <div className="modal__body">
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">
                      {t('family:fields.displayName')} *
                    </label>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Мария Иванова"
                    value={inviteForm.inviteeName}
                    onChange={(e) => setInviteForm({ ...inviteForm, inviteeName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">
                      {t('family:fields.email')} *
                    </label>
                    <HelpTooltip tooltipKey="family.inviteEmail" />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="maria@example.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t('deposits:fields.reason')}
                  </label>
                  <textarea
                    rows="2"
                    placeholder="..."
                    value={inviteForm.message}
                    onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition cursor-pointer"
                  >
                    {t('common:actions.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer"
                  >
                    {inviteLoading ? t('common:a11y.loading') : t('common:actions.send')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Transfer Ownership Confirmation */}
      {showTransferModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-amber-300 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                {t('family:transferOwnership')}
              </h3>
              <button
                type="button"
                onClick={() => setShowTransferModal(null)}
                className="close-btn"
                aria-label={t('common:actions.close')}
              >
                &times;
              </button>
            </div>

            <div className="modal__body space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                {showTransferModal.displayName} ({showTransferModal.email})
              </p>

              <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-lg text-[11px] text-amber-200">
                <div className="flex items-center gap-1.5 mb-1 font-semibold">
                  <span>{t('family:transferNotice')}</span>
                  <HelpTooltip tooltipKey="family.transferOwner" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition cursor-pointer"
                >
                  {t('common:actions.cancel')}
                </button>
                <button
                  type="button"
                  disabled={transferLoading}
                  onClick={handleInitiateTransfer}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer"
                >
                  {transferLoading ? t('common:a11y.loading') : t('common:actions.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Adult Confirmation */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                {t('common:actions.delete')}
              </h3>
              <button
                type="button"
                onClick={() => setShowDeleteModal(null)}
                className="close-btn"
                aria-label={t('common:actions.close')}
              >
                &times;
              </button>
            </div>

            <div className="modal__body space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                {showDeleteModal.displayName} ({showDeleteModal.email})
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition cursor-pointer"
                >
                  {t('common:actions.cancel')}
                </button>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={handleDeleteAdult}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer"
                >
                  {deleteLoading ? t('common:a11y.loading') : t('common:actions.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdultsTab;
