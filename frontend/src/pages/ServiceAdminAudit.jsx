import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Shield, Search, Filter, Download, ArrowLeft, RefreshCw, Layers, Calendar, User, Globe, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../components/LanguageSwitcher';
import HelpTooltip from '../components/HelpTooltip';
import { formatDateTime } from '../utils/formatters';

const ServiceAdminAudit = ({ user, onLogout }) => {
  const { t, i18n } = useTranslation(['audit', 'common', 'tooltips', 'errors']);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Data
  const [families, setFamilies] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [filterFamilyId, setFilterFamilyId] = useState('');
  const [filterActorUserId, setFilterActorUserId] = useState('');
  const [filterEventType, setFilterEventType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterIp, setFilterIp] = useState('');
  const [filterRequestId, setFilterRequestId] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const [activeSubTab, setActiveSubTab] = useState('audit'); // 'audit' | 'families'

  useEffect(() => {
    fetchFamilies();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'audit') {
      fetchAuditLogs();
    }
  }, [page, activeSubTab]);

  const fetchFamilies = async () => {
    try {
      const res = await axios.get('/service-admin/families');
      setFamilies(res.data);
    } catch (err) {
      console.error('Fetch service admin families error:', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('pageSize', '25');
      if (filterFamilyId) params.append('familyId', filterFamilyId);
      if (filterActorUserId) params.append('actorUserId', filterActorUserId);
      if (filterEventType) params.append('eventType', filterEventType);
      if (filterFrom) params.append('from', filterFrom);
      if (filterTo) params.append('to', filterTo);
      if (filterIp) params.append('ipAddress', filterIp);
      if (filterRequestId) params.append('requestId', filterRequestId);
      if (filterSearch) params.append('search', filterSearch);

      const res = await axios.get(`/service-admin/audit-logs?${params.toString()}`);
      setAuditLogs(res.data.logs || []);
      setTotalLogs(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      setError(err.response?.data?.error || t('common:noData'));
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
    setFilterFamilyId('');
    setFilterActorUserId('');
    setFilterEventType('');
    setFilterFrom('');
    setFilterTo('');
    setFilterIp('');
    setFilterRequestId('');
    setFilterSearch('');
    setPage(1);
    setTimeout(() => fetchAuditLogs(), 50);
  };

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (filterFamilyId) params.append('familyId', filterFamilyId);
      if (filterActorUserId) params.append('actorUserId', filterActorUserId);
      if (filterEventType) params.append('eventType', filterEventType);
      if (filterFrom) params.append('from', filterFrom);
      if (filterTo) params.append('to', filterTo);
      if (filterIp) params.append('ipAddress', filterIp);
      if (filterRequestId) params.append('requestId', filterRequestId);
      if (filterSearch) params.append('search', filterSearch);

      window.open(`/api/service-admin/audit-logs/export-csv?${params.toString()}`, '_blank');
    } catch (err) {
      console.error('Export CSV error:', err);
    }
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 border border-slate-800 rounded-2xl p-6 gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
            title={t('common:actions.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-purple-400" />
              <h1 className="text-xl font-bold text-slate-100">{t('audit:title')} (Global)</h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Сервисный аудит для всех семей с фильтрацией по семьям и экспортом CSV.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher user={user} />
          <button
            onClick={fetchAuditLogs}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
            title={t('common:actions.refresh')}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition shadow cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Экспорт CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 text-red-300 text-sm p-4 rounded-xl">
          {error}
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl max-w-xs gap-1">
        <button
          onClick={() => setActiveSubTab('audit')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
            activeSubTab === 'audit' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('audit:title')}
        </button>
        <button
          onClick={() => setActiveSubTab('families')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
            activeSubTab === 'families' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Семьи ({families.length})
        </button>
      </div>

      {activeSubTab === 'audit' ? (
        <>
          {/* Filters Form */}
          <form onSubmit={handleApplyFilters} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Filter className="w-4 h-4 text-purple-400" />
                Фильтрация записей аудита
              </h3>
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                {t('common:actions.reset')}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-400">Семья</label>
                  <HelpTooltip tooltipKey="audit.filterFamily" />
                </div>
                <select
                  value={filterFamilyId}
                  onChange={(e) => setFilterFamilyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="">Все семьи</option>
                  {families.map((fam) => (
                    <option key={fam.id} value={fam.id}>
                      {fam.name} (ID: {fam.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-400">{t('audit:filters.eventType')}</label>
                  <HelpTooltip tooltipKey="audit.filterEvent" />
                </div>
                <input
                  type="text"
                  placeholder="auth_login_success, bank_created..."
                  value={filterEventType}
                  onChange={(e) => setFilterEventType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('audit:filters.dateFrom')}</label>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('audit:filters.dateTo')}</label>
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">IP-адрес</label>
                <input
                  type="text"
                  placeholder="127.0.0.1..."
                  value={filterIp}
                  onChange={(e) => setFilterIp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Request ID</label>
                <input
                  type="text"
                  placeholder="req-123..."
                  value={filterRequestId}
                  onChange={(e) => setFilterRequestId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('audit:filters.actor')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Имя, email, детали..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-lg transition cursor-pointer"
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
              <h2 className="text-md font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" />
                {t('audit:title')} ({totalLogs})
              </h2>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400">{t('common:loading')}</div>
            ) : auditLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-500">{t('common:noData')}</div>
            ) : (
              <div className="table-scroll">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-3">{t('audit:columns.time')}</th>
                      <th className="py-3 px-3">Семья</th>
                      <th className="py-3 px-3">{t('audit:columns.actor')}</th>
                      <th className="py-3 px-3">{t('audit:columns.event')}</th>
                      <th className="py-3 px-3">{t('audit:columns.details')}</th>
                      <th className="py-3 px-3">IP / Req ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-300">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          {formatDateTime(log.createdAt, locale)}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-200">
                          {log.familyName || '—'}
                          <div className="text-[10px] text-slate-500 font-mono">ID: {log.familyId}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-200">{log.actorName}</div>
                          <div className="text-[10px] text-slate-500 capitalize">{log.actorRole || '—'}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-block px-2.5 py-0.5 border rounded-full text-[10px] font-medium ${getEventBadgeClass(log.eventType)}`}>
                            {log.eventType}
                          </span>
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <pre className="text-[11px] font-mono bg-slate-950/80 p-2 rounded border border-slate-800 overflow-x-auto max-h-24 scrollbar scrollbar--thin">
                            {JSON.stringify(log.metadata, null, 1)}
                          </pre>
                        </td>
                        <td className="py-3 px-3 font-mono text-[10px] text-slate-500">
                          <div>{log.ipAddress || '—'}</div>
                          <div className="truncate max-w-[100px] text-[9px]">{log.requestId}</div>
                        </td>
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
        </>
      ) : (
        /* Families List */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-md font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-400" />
            Все семьи в системе ({families.length})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {families.map((fam) => (
              <div key={fam.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-100">{fam.name}</h3>
                    <div className="text-[10px] font-mono text-slate-500">ID: {fam.id}</div>
                  </div>
                  <button
                    onClick={() => {
                      setFilterFamilyId(fam.id.toString());
                      setActiveSubTab('audit');
                    }}
                    className="px-2.5 py-1 bg-purple-950/80 hover:bg-purple-900/80 text-purple-300 border border-purple-800/60 rounded text-[10px] font-medium transition cursor-pointer"
                  >
                    Журнал
                  </button>
                </div>

                <div className="text-xs text-slate-400 space-y-1">
                  <div>Владелец: <strong className="text-slate-200">{fam.owner_name}</strong></div>
                  <div>Участников: <span className="font-mono text-slate-200">{fam.adults_count} взр. / {fam.children_count} дет.</span></div>
                  <div>Создана: {formatDateTime(fam.created_at, locale)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default ServiceAdminAudit;
