import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { FileText, Filter, RefreshCw, Search, Calendar, User, ShieldAlert } from 'lucide-react';
import HelpTooltip from './HelpTooltip';
import { formatDateTime } from '../utils/formatters';

const AuditLogTab = ({ isOwner, addToast }) => {
  const { t, i18n } = useTranslation(['audit', 'common', 'tooltips']);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterEventType, setFilterEventType] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  useEffect(() => {
    fetchAuditLogs();
  }, [page]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('pageSize', '20');
      if (filterFrom) params.append('from', filterFrom);
      if (filterTo) params.append('to', filterTo);
      if (filterEventType) params.append('eventType', filterEventType);
      if (filterSearch) params.append('search', filterSearch);

      const res = await axios.get(`/family/audit-logs?${params.toString()}`);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      addToast(err.response?.data?.error || t('common:noData'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    fetchAuditLogs();
  };

  const handleResetFilters = () => {
    setFilterFrom('');
    setFilterTo('');
    setFilterEventType('');
    setFilterSearch('');
    setPage(1);
    setTimeout(() => fetchAuditLogs(), 50);
  };

  const getEventBadgeClass = (eventType) => {
    if (eventType?.includes('deleted') || eventType?.includes('removed') || eventType?.includes('failed') || eventType?.includes('rejected') || eventType?.includes('revoked')) {
      return 'bg-red-950/60 text-red-300 border-red-800/60';
    }
    if (eventType?.includes('created') || eventType?.includes('accepted') || eventType?.includes('approved') || eventType?.includes('granted') || eventType?.includes('success')) {
      return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
    }
    if (eventType?.includes('transfer') || eventType?.includes('proposed')) {
      return 'bg-amber-950/60 text-amber-300 border-amber-800/60';
    }
    return 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60';
  };

  const locale = i18n.language || 'ru';

  return (
    <div className="space-y-6">
      
      {/* Filters Card */}
      <form onSubmit={handleApplyFilters} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-semibold text-white flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-400" />
            {t('audit:title')}
          </h3>
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            {t('common:actions.reset')}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-400">{t('audit:filters.eventType')}</label>
              <HelpTooltip tooltipKey="audit.filterEvent" />
            </div>
            <select
              value={filterEventType}
              onChange={(e) => setFilterEventType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">{t('audit:filters.allEvents')}</option>
              <option value="bank_create">{t('audit:eventTypes.bank_create')}</option>
              <option value="bank_update">{t('audit:eventTypes.bank_update')}</option>
              <option value="deposit_open">{t('audit:eventTypes.deposit_open')}</option>
              <option value="deposit_close">{t('audit:eventTypes.deposit_close')}</option>
              <option value="deposit_topup">{t('audit:eventTypes.deposit_topup')}</option>
              <option value="parent_reward">{t('audit:eventTypes.parent_reward')}</option>
              <option value="auth_login_success">{t('audit:eventTypes.auth_login_success')}</option>
              <option value="auth_login_failed">{t('audit:eventTypes.auth_login_failed')}</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-400">{t('audit:filters.dateFrom')}</label>
              <HelpTooltip tooltipKey="audit.filterDate" />
            </div>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t('audit:filters.dateTo')}</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">{t('audit:filters.actor')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition cursor-pointer"
              >
                {t('common:actions.apply')}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Audit Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              {t('audit:title')} ({total})
            </h2>
          </div>
          <button
            onClick={fetchAuditLogs}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition cursor-pointer"
            title={t('common:actions.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">{t('common:loading')}</div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-slate-500">{t('common:noData')}</div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">{t('audit:columns.time')}</th>
                  <th className="py-3 px-3">{t('audit:columns.actor')}</th>
                  <th className="py-3 px-3">{t('audit:columns.event')}</th>
                  <th className="py-3 px-3">{t('audit:columns.details')}</th>
                  {isOwner && <th className="py-3 px-3">IP</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                      {formatDateTime(log.createdAt, locale)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-200">{log.actorName}</div>
                      <div className="text-[10px] text-slate-500 capitalize">{log.actorRole || '—'}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-block px-2.5 py-0.5 border rounded-full text-[10px] font-medium ${getEventBadgeClass(log.eventType)}`}>
                        {t(`audit:eventTypes.${log.eventType}`, log.eventType)}
                      </span>
                    </td>
                    <td className="py-3 px-3 max-w-sm">
                      <pre className="text-[11px] font-mono bg-slate-950/80 p-2 rounded border border-slate-800 overflow-x-auto max-h-24 scrollbar scrollbar--thin">
                        {JSON.stringify(log.metadata, null, 1)}
                      </pre>
                    </td>
                    {isOwner && (
                      <td className="py-3 px-3 font-mono text-[10px] text-slate-500">
                        <div>{log.ipAddress || '—'}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
            <div>{page} / {totalPages}</div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 bg-slate-800 disabled:opacity-50 text-slate-200 rounded hover:bg-slate-700 transition cursor-pointer"
              >
                {t('common:actions.back')}
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 bg-slate-800 disabled:opacity-50 text-slate-200 rounded hover:bg-slate-700 transition cursor-pointer"
              >
                {t('common:actions.next')}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default AuditLogTab;
