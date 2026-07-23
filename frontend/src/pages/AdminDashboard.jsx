import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, DollarSign, Clock, TrendingUp, RefreshCw, LogOut, Check, X, 
  Settings, Plus, Trash2, Shield, Calendar, ShieldAlert, Key, Save, Eye,
  Archive, RotateCcw, AlertCircle, AlertTriangle
} from 'lucide-react';

const AdminDashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('operations'); // 'operations', 'banks', 'children', 'audit_logs', 'global_families'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Dashboard Stats
  const [familyStats, setFamilyStats] = useState({
    total_children: 0,
    total_active_deposits: 0,
    total_invested_kopecks: 0,
    total_virtual_sum_kopecks: 0,
    total_earned_interest_kopecks: 0,
    pending_operations_count: 0,
    distribution: []
  });

  // Lists
  const [pendingOps, setPendingOps] = useState([]);
  const [banksList, setBanksList] = useState([]);
  const [childrenList, setChildrenList] = useState([]);
  const [globalFamilies, setGlobalFamilies] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [familyDeposits, setFamilyDeposits] = useState([]);

  // Parent Reward & Deposit Details States
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardChild, setRewardChild] = useState(null);
  const [rewardDeposit, setRewardDeposit] = useState(null);
  const [rewardForm, setRewardForm] = useState({ amountRubles: '', notes: '' });
  const [rewardStep, setRewardStep] = useState('input'); // 'input', 'confirm'
  const [rewardLoading, setRewardLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [lockDepositSelector, setLockDepositSelector] = useState(false);

  const [showDepositDetailsModal, setShowDepositDetailsModal] = useState(false);
  const [detailedDepositAdmin, setDetailedDepositAdmin] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Modals & Action States
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [childForm, setChildForm] = useState({
    username: '',
    displayName: '',
    temporaryPassword: '',
    birthDate: '',
    avatarColor: '#4f46e5'
  });

  const [showResetPassModal, setShowResetPassModal] = useState(null); // child user object
  const [resetPassForm, setResetPassForm] = useState({
    temporaryPassword: ''
  });

  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({
    name: '',
    description: '',
    color: '#6366f1',
    icon: 'piggy-bank',
    interestRateBps: '400', // 4%
    periodDays: '30',
    minimumDepositRubles: '1000',
    maximumDepositRubles: '',
    earlyWithdrawalPenaltyBps: '200', // 2%
    minimumHoldingDays: '0',
    // V2 Topup features
    allowTopUp: true,
    minimumTopUpRubles: '100',
    maximumTopUpRubles: '',
    maximumTotalDepositPerChildRubles: '',
    interestAccrualMode: 'whole_balance_on_schedule'
  });

  const [editingBank, setEditingBank] = useState(null);

  // Global Admin Variables
  const [supportAccessReason, setSupportAccessReason] = useState('');
  const [searchFamilyQuery, setSearchFamilyQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');

      if (user.platformRole === 'global_admin' && activeTab === 'global_families') {
        const res = await axios.get(`/admin/families?search=${searchFamilyQuery}`);
        setGlobalFamilies(res.data);
      } else if (user.platformRole === 'global_admin' && activeTab === 'audit_logs') {
        const res = await axios.get('/admin/audit-logs');
        setAuditLogs(res.data);
      } else {
        const statsRes = await axios.get('/analytics/family');
        setFamilyStats(statsRes.data);

        if (activeTab === 'operations') {
          const opsRes = await axios.get('/operations/pending');
          setPendingOps(opsRes.data);
        } else if (activeTab === 'banks') {
          const banksRes = await axios.get('/banks?include_archived=true');
          setBanksList(banksRes.data);
        } else if (activeTab === 'children') {
          const childRes = await axios.get('/children');
          setChildrenList(childRes.data);
          const depositsRes = await axios.get('/deposits');
          setFamilyDeposits(depositsRes.data);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  // Operation Approvals
  const handleApproveOp = async (opId) => {
    setError('');
    setSuccessMessage('');
    try {
      const res = await axios.post(`/operations/${opId}/approve`);
      setSuccessMessage(res.data.message);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось одобрить операцию.');
    }
  };

  const handleRejectOp = async (opId, reason = 'Отклонено родителями') => {
    setError('');
    setSuccessMessage('');
    try {
      const res = await axios.post(`/operations/${opId}/reject`, { reason });
      setSuccessMessage(res.data.message);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отклонить операцию.');
    }
  };

  // Bank Actions
  const handleCreateBank = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      const minKopecks = Math.round(parseFloat(bankForm.minimumDepositRubles) * 100);
      const maxKopecks = bankForm.maximumDepositRubles ? Math.round(parseFloat(bankForm.maximumDepositRubles) * 100) : null;
      const minTopUpKopecks = bankForm.allowTopUp && bankForm.minimumTopUpRubles ? Math.round(parseFloat(bankForm.minimumTopUpRubles) * 100) : null;
      const maxTopUpKopecks = bankForm.allowTopUp && bankForm.maximumTopUpRubles ? Math.round(parseFloat(bankForm.maximumTopUpRubles) * 100) : null;
      const maxTotalKopecks = bankForm.maximumTotalDepositPerChildRubles ? Math.round(parseFloat(bankForm.maximumTotalDepositPerChildRubles) * 100) : null;

      const payload = {
        name: bankForm.name.trim(),
        description: bankForm.description.trim(),
        color: bankForm.color,
        icon: bankForm.icon,
        interestRateBps: parseInt(bankForm.interestRateBps, 10),
        periodDays: parseInt(bankForm.periodDays, 10),
        minimumDepositKopecks: minKopecks,
        maximumDepositPerChildKopecks: maxKopecks,
        earlyWithdrawalPenaltyBps: parseInt(bankForm.earlyWithdrawalPenaltyBps, 10),
        minimumHoldingDays: parseInt(bankForm.minimumHoldingDays, 10),
        allowTopUp: bankForm.allowTopUp,
        minimumTopUpKopecks: minTopUpKopecks,
        maximumTopUpKopecks: maxTopUpKopecks,
        maximumTotalDepositPerChildKopecks: maxTotalKopecks,
        interestAccrualMode: bankForm.interestAccrualMode
      };

      const res = await axios.post('/banks', payload);
      setSuccessMessage(res.data.message);
      setShowAddBankModal(false);
      setBankForm({
        name: '', description: '', color: '#6366f1', icon: 'piggy-bank',
        interestRateBps: '400', periodDays: '30', minimumDepositRubles: '1000',
        maximumDepositRubles: '', earlyWithdrawalPenaltyBps: '200', minimumHoldingDays: '0',
        allowTopUp: true, minimumTopUpRubles: '100', maximumTopUpRubles: '',
        maximumTotalDepositPerChildRubles: '', interestAccrualMode: 'whole_balance_on_schedule'
      });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при добавлении банка.');
    }
  };

  const handleSaveBankChanges = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      const minKopecks = Math.round(parseFloat(editingBank.minimum_deposit_rubles) * 100);
      const maxKopecks = editingBank.maximum_deposit_rubles ? Math.round(parseFloat(editingBank.maximum_deposit_rubles) * 100) : null;
      const minTopUpKopecks = editingBank.allow_top_up && editingBank.minimum_top_up_rubles ? Math.round(parseFloat(editingBank.minimum_top_up_rubles) * 100) : null;
      const maxTopUpKopecks = editingBank.allow_top_up && editingBank.maximum_top_up_rubles ? Math.round(parseFloat(editingBank.maximum_top_up_rubles) * 100) : null;
      const maxTotalKopecks = editingBank.maximum_total_deposit_per_child_rubles ? Math.round(parseFloat(editingBank.maximum_total_deposit_per_child_rubles) * 100) : null;

      const payload = {
        name: editingBank.name,
        description: editingBank.description,
        color: editingBank.color,
        icon: editingBank.icon,
        interestRateBps: parseInt(editingBank.interest_rate_bps, 10),
        periodDays: parseInt(editingBank.period_days, 10),
        minimumDepositKopecks: minKopecks,
        maximumDepositPerChildKopecks: maxKopecks,
        earlyWithdrawalPenaltyBps: parseInt(editingBank.early_withdrawal_penalty_bps, 10),
        minimumHoldingDays: parseInt(editingBank.minimum_holding_days, 10),
        allowTopUp: editingBank.allow_top_up,
        minimumTopUpKopecks: minTopUpKopecks,
        maximumTopUpKopecks: maxTopUpKopecks,
        maximumTotalDepositPerChildKopecks: maxTotalKopecks,
        interestAccrualMode: editingBank.interest_accrual_mode
      };

      const res = await axios.patch(`/banks/${editingBank.id}`, payload);
      setSuccessMessage(res.data.message);
      setEditingBank(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка при редактировании условий.');
    }
  };

  const handleArchiveBank = async (bankId) => {
    setError('');
    setSuccessMessage('');
    try {
      const res = await axios.post(`/banks/${bankId}/archive`);
      setSuccessMessage(res.data.message);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось заархивировать банк.');
    }
  };

  const handleRestoreBank = async (bankId) => {
    setError('');
    setSuccessMessage('');
    try {
      const res = await axios.post(`/banks/${bankId}/restore`);
      setSuccessMessage(res.data.message);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось восстановить банк.');
    }
  };

  // Child Actions
  const handleAddChildSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      const res = await axios.post('/children', {
        username: childForm.username,
        displayName: childForm.displayName,
        temporaryPassword: childForm.temporaryPassword,
        birthDate: childForm.birthDate || null,
        avatarColor: childForm.avatarColor
      });

      setSuccessMessage(res.data.message);
      setShowAddChildModal(false);
      setChildForm({ username: '', displayName: '', temporaryPassword: '', birthDate: '', avatarColor: '#4f46e5' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка добавления профиля ребенка.');
    }
  };

  const handleResetChildPasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      const res = await axios.post(`/children/${showResetPassModal.id}/reset-password`, {
        temporaryPassword: resetPassForm.temporaryPassword
      });

      setSuccessMessage(res.data.message);
      setShowResetPassModal(null);
      setResetPassForm({ temporaryPassword: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сброса пароля.');
    }
  };

  const handleOpenRewardModal = (c) => {
    setModalError('');
    setRewardChild(c);
    const activeDeposits = familyDeposits.filter(d => d.child_user_id === c.id && d.status === 'active');
    if (activeDeposits.length > 0) {
      setRewardDeposit(activeDeposits[0]);
    } else {
      setRewardDeposit(null);
    }
    setLockDepositSelector(false);
    setRewardForm({ amountRubles: '', notes: '' });
    setRewardStep('input');
    setShowRewardModal(true);
  };

  const handleFastReward = (c, d) => {
    setModalError('');
    setRewardChild(c);
    setRewardDeposit(d);
    setLockDepositSelector(true);
    setRewardForm({ amountRubles: '', notes: '' });
    setRewardStep('input');
    setShowRewardModal(true);
  };

  const handleNextToConfirm = () => {
    setModalError('');
    if (!rewardDeposit) {
      setModalError('Пожалуйста, выберите активный вклад.');
      return;
    }
    const amt = parseFloat(rewardForm.amountRubles);
    if (isNaN(amt) || amt <= 0) {
      setModalError('Пожалуйста, укажите положительную сумму поощрения.');
      return;
    }
    if (!rewardForm.notes || rewardForm.notes.trim().length < 3 || rewardForm.notes.trim().length > 300) {
      setModalError('Комментарий обязателен и должен содержать от 3 до 300 символов.');
      return;
    }
    setRewardStep('confirm');
  };

  const handleSubmitReward = async () => {
    setRewardLoading(true);
    setModalError('');
    
    const rewardKopecks = Math.round(parseFloat(rewardForm.amountRubles) * 100);
    const cleanIdempotencyKey = `reward-${rewardDeposit.id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await axios.post(`/deposits/${rewardDeposit.id}/parent-rewards`, {
        amountKopecks: rewardKopecks,
        notes: rewardForm.notes,
        idempotencyKey: cleanIdempotencyKey
      });

      if (res.data.success) {
        await fetchData();
        setShowRewardModal(false);
        setShowDepositDetailsModal(false);
        setSuccessMessage(`Поощрение +${parseFloat(rewardForm.amountRubles).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽ зачислено Пете`);
      }
    } catch (err) {
      setModalError(err.response?.data?.error || 'Ошибка при зачислении поощрения.');
    } finally {
      setRewardLoading(false);
    }
  };

  const handleViewDepositDetails = async (deposit) => {
    setDetailsLoading(true);
    setError('');
    try {
      const res = await axios.get(`/deposits/${deposit.id}`);
      setDetailedDepositAdmin(res.data);
      setShowDepositDetailsModal(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось загрузить подробности вклада.');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Support / Global Actions
  const handleActivateFamily = async (famId) => {
    try {
      await axios.post(`/admin/families/${famId}/activate`);
      setSuccessMessage('Семья успешно разблокирована.');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка изменения статуса.');
    }
  };

  const handleBlockFamily = async (famId) => {
    const reason = window.prompt('Укажите причину блокировки:');
    if (!reason) return;
    try {
      await axios.post(`/admin/families/${famId}/block`, { reason });
      setSuccessMessage('Семья успешно заблокирована.');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка блокировки семьи.');
    }
  };

  const handleDeleteFamily = async (famId) => {
    if (!window.confirm('Вы действительно хотите пометить эту семью как удаленную? (soft-delete)')) {
      return;
    }
    try {
      await axios.delete(`/admin/families/${famId}`);
      setSuccessMessage('Семья успешно удалена.');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка удаления семьи.');
    }
  };

  const formatKopecks = (kopecks) => {
    return ((kopecks || 0) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return 'Активна';
      case 'blocked': return 'Заблокирована';
      case 'pending': return 'Ожидает верификации';
      default: return status;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 border border-slate-800 rounded-2xl p-6 gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">👑</span>
            <h1 className="text-2xl font-bold text-slate-100">Панель Управления</h1>
          </div>
          <p className="text-sm text-slate-400">
            {user.platformRole === 'global_admin' ? (
              <span className="text-rose-400 font-bold flex items-center gap-1">
                <Shield className="h-4 w-4" /> Администратор платформы (Support Access)
              </span>
            ) : (
              <span>Семейный контроль для пространства <strong className="text-indigo-400">{user.familyName}</strong></span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 self-stretch sm:self-auto">
          <button
            id="btn-refresh-admin"
            onClick={fetchData}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Обновить</span>
          </button>
          <button
            id="btn-logout-admin"
            onClick={onLogout}
            className="bg-slate-950 hover:bg-rose-950/40 hover:text-rose-400 text-slate-400 rounded-xl p-2.5 border border-slate-800 hover:border-rose-900 transition flex items-center gap-1.5 text-sm font-semibold"
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:inline">Выйти</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-950/40 border border-red-800 text-red-300 text-sm p-4 rounded-xl flex items-start gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-sm p-4 rounded-xl">
          {successMessage}
        </div>
      )}

      {/* Stats Cards Bento */}
      {!(user.platformRole === 'global_admin' && (activeTab === 'global_families' || activeTab === 'audit_logs')) && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
            <div className="bg-indigo-500/10 text-indigo-400 p-3 rounded-xl border border-indigo-500/20">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">Детей в семье</span>
              <span className="text-2xl font-extrabold text-slate-100 block">{familyStats.total_children}</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
            <div className="bg-emerald-500/10 text-emerald-400 p-3 rounded-xl border border-emerald-500/20">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">Внесено в банки</span>
              <span className="text-xl font-bold text-slate-100 font-mono block">{formatKopecks(familyStats.total_invested_kopecks)}</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
            <div className="bg-amber-500/10 text-amber-400 p-3 rounded-xl border border-amber-500/20">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">Ожидает одобрения</span>
              <span className="text-2xl font-extrabold text-slate-100 block">{familyStats.pending_operations_count}</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
            <div className="bg-purple-500/10 text-purple-400 p-3 rounded-xl border border-purple-500/20">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">Начислено процентов</span>
              <span className="text-xl font-bold text-slate-100 font-mono block">{formatKopecks(familyStats.total_earned_interest_kopecks)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Tab Navigation */}
      <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl max-w-2xl">
        {user.platformRole === 'global_admin' ? (
          <>
            <button
              onClick={() => setActiveTab('global_families')}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'global_families' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Семьи Платформы
            </button>
            <button
              onClick={() => setActiveTab('audit_logs')}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'audit_logs' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Системный Аудит
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab('operations')}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'operations' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ожидающие Заявки ({familyStats.pending_operations_count})
            </button>
            <button
              onClick={() => setActiveTab('banks')}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'banks' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Семейные Банки
            </button>
            <button
              onClick={() => setActiveTab('children')}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'children' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Дети в семье
            </button>
          </>
        )}
      </div>

      {/* Tab Contents */}
      {activeTab === 'operations' && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-200">Список Ожидающих Заявок детей</h2>
          {pendingOps.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
              <Check className="h-12 w-12 text-emerald-500 mx-auto mb-2" />
              <h3 className="font-bold text-slate-300">Все операции обработаны!</h3>
              <p className="text-xs text-slate-500 mt-1">Ожидающих заявок от детей на открытие, закрытие или пополнение вкладов нет.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingOps.map(op => (
                <div key={op.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between hover:border-slate-700 transition">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-400 font-mono">
                          {op.type === 'open' ? '📥 Запрос на открытие вклада' : 
                           op.type === 'withdraw' ? '📤 Запрос на вывод средств' :
                           op.type === 'top_up' ? '💰 Запрос на пополнение вклада' : op.type}
                        </span>
                        <h4 className="text-sm font-bold text-slate-200 mt-1">Ребенок: {op.child_name}</h4>
                        <p className="text-[10px] text-slate-500 font-mono">Запрошено: {new Date(op.requested_at).toLocaleDateString()}</p>
                      </div>
                      <span className="bg-slate-950 px-2 py-0.5 border border-slate-800 rounded font-bold text-[10px] text-slate-300">
                        {op.bank_name}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Заявленная сумма:</span>
                        <strong className="text-slate-200">{formatKopecks(op.amount_kopecks)}</strong>
                      </div>
                      {op.type === 'withdraw' && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Досрочный вывод:</span>
                            <strong className={op.is_early ? 'text-amber-400' : 'text-slate-500'}>
                              {op.is_early ? `Да (Всего ${op.days_held} дн.)` : 'Нет'}
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Процентная прибыль:</span>
                            <strong className="text-emerald-400">+{formatKopecks(op.calculated_interest_kopecks)}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Наложенный штраф:</span>
                            <strong className="text-rose-400">-{formatKopecks(op.calculated_penalty_kopecks)}</strong>
                          </div>
                          <div className="flex justify-between border-t border-slate-800 pt-2 font-bold">
                            <span className="text-indigo-400">Итого к выдаче:</span>
                            <strong className="text-indigo-300">{formatKopecks(op.calculated_payout_kopecks)}</strong>
                          </div>
                        </>
                      )}
                    </div>

                    {op.notes && (
                      <p className="bg-slate-950/40 p-2.5 rounded border border-slate-800/40 text-[10px] text-slate-400 leading-relaxed">
                        <strong>Примечание:</strong> {op.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => handleApproveOp(op.id)}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg py-2.5 text-xs font-semibold transition flex items-center justify-center gap-1"
                    >
                      <Check className="h-4 w-4" />
                      <span>Одобрить</span>
                    </button>
                    <button
                      onClick={() => {
                        const reason = window.prompt('Укажите причину отказа:');
                        if (reason !== null) handleRejectOp(op.id, reason);
                      }}
                      className="flex-1 bg-slate-950 hover:bg-rose-950/40 hover:text-rose-400 text-slate-500 hover:border-rose-900/30 border border-slate-800 rounded-lg py-2.5 text-xs font-semibold transition flex items-center justify-center gap-1"
                    >
                      <X className="h-4 w-4" />
                      <span>Отклонить</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'banks' && (
        <section className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-200">Банки и условия вкладов</h2>
            <button
              id="btn-add-bank"
              onClick={() => setShowAddBankModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-xs font-semibold transition flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              <span>Создать Банк</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {banksList.map(b => (
              <div key={b.id} className={`bg-slate-900 border rounded-2xl p-5 shadow-lg flex flex-col justify-between transition ${
                b.is_active ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/40 opacity-50 bg-slate-950/20'
              }`}>
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: b.color || '#6366f1' }}></div>
                      <h3 className="text-sm font-bold text-slate-200">{b.name}</h3>
                    </div>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                      b.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400 border border-slate-800/40'
                    }`}>
                      {b.is_active ? 'Работает' : 'В Архиве'}
                    </span>
                  </div>

                  {b.description && (
                    <p className="text-xs text-slate-500 leading-relaxed font-sans">{b.description}</p>
                  )}

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Процентная ставка:</span>
                      <strong className="text-slate-200">{(b.interest_rate_bps / 100).toFixed(2)}%</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Период начисления:</span>
                      <strong className="text-slate-200">{b.period_days} дн.</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Мин. вклад:</span>
                      <strong className="text-slate-200">{formatKopecks(b.minimum_deposit_kopecks)}</strong>
                    </div>
                    {b.maximum_deposit_per_child_kopecks && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Макс. лимит/ребенок:</span>
                        <strong className="text-slate-200">{formatKopecks(b.maximum_deposit_per_child_kopecks)}</strong>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-900 pt-1.5 text-[10px]">
                      <span className="text-slate-400">Пополнение открытого вклада:</span>
                      <strong className={b.allow_top_up ? 'text-emerald-400' : 'text-slate-500'}>
                        {b.allow_top_up ? 'Разрешено' : 'Запрещено'}
                      </strong>
                    </div>
                    {b.allow_top_up === 1 && (
                      <>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Мин. сумма пополнения:</span>
                          <strong className="text-slate-300">{formatKopecks(b.minimum_top_up_kopecks)}</strong>
                        </div>
                        {b.maximum_top_up_kopecks && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Макс. сумма пополнения:</span>
                            <strong className="text-slate-300">{formatKopecks(b.maximum_top_up_kopecks)}</strong>
                          </div>
                        )}
                        {b.maximum_total_deposit_per_child_kopecks && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Предел баланса вклада:</span>
                            <strong className="text-slate-300">{formatKopecks(b.maximum_total_deposit_per_child_kopecks)}</strong>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex justify-between border-t border-slate-900 pt-1.5 text-[10px]">
                      <span className="text-slate-400">Режим начисления:</span>
                      <strong className="text-indigo-400">
                        {b.interest_accrual_mode === 'per_contribution_period' ? 'Реалистичный (по вкладам)' : 'Простой (общий баланс)'}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-5">
                  <button
                    onClick={() => setEditingBank({
                      id: b.id,
                      name: b.name,
                      description: b.description || '',
                      color: b.color || '#6366f1',
                      icon: b.icon || 'piggy-bank',
                      interest_rate_bps: b.interest_rate_bps.toString(),
                      period_days: b.period_days.toString(),
                      minimum_deposit_rubles: (b.minimum_deposit_kopecks / 100).toString(),
                      maximum_deposit_rubles: b.maximum_deposit_per_child_kopecks ? (b.maximum_deposit_per_child_kopecks / 100).toString() : '',
                      early_withdrawal_penalty_bps: b.early_withdrawal_penalty_bps.toString(),
                      minimum_holding_days: b.minimum_holding_days.toString(),
                      allow_top_up: b.allow_top_up === 1 || b.allow_top_up === true,
                      minimum_top_up_rubles: b.minimum_top_up_kopecks ? (b.minimum_top_up_kopecks / 100).toString() : '100',
                      maximum_top_up_rubles: b.maximum_top_up_kopecks ? (b.maximum_top_up_kopecks / 100).toString() : '',
                      maximum_total_deposit_per_child_rubles: b.maximum_total_deposit_per_child_kopecks ? (b.maximum_total_deposit_per_child_kopecks / 100).toString() : '',
                      interest_accrual_mode: b.interest_accrual_mode || 'whole_balance_on_schedule'
                    })}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-300 rounded-lg py-2 text-xs font-semibold transition"
                  >
                    Редактировать
                  </button>
                  {b.is_active ? (
                    <button
                      onClick={() => handleArchiveBank(b.id)}
                      className="flex-1 bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 border border-rose-950/40 rounded-lg py-2 text-xs font-semibold transition"
                    >
                      В Архив
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRestoreBank(b.id)}
                      className="flex-1 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-400 border border-emerald-950/40 rounded-lg py-2 text-xs font-semibold transition"
                    >
                      Вернуть
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'children' && (
        <section className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-200">Дети вашей семьи</h2>
            <button
              id="btn-add-child"
              onClick={() => setShowAddChildModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2.5 text-xs font-semibold transition flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              <span>Добавить ребенка</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {childrenList.map(c => {
              const childActiveDeposits = familyDeposits.filter(d => d.child_user_id === c.id && d.status === 'active');
              return (
                <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between hover:border-slate-700 transition">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border border-slate-800 shadow" style={{ backgroundColor: `${c.avatar_color}33`, color: c.avatar_color }}>
                        👦
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-200">{c.display_name}</h3>
                        <span className="text-[10px] text-slate-500 block font-mono">Системный логин: <strong>{c.fullUsername}</strong></span>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-1.5 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500">День рождения:</span>
                        <strong className="text-slate-200">{c.birth_date ? new Date(c.birth_date).toLocaleDateString() : 'Не указан'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Должен сменить пароль:</span>
                        <strong className={c.must_change_password ? 'text-amber-400' : 'text-slate-500'}>
                          {c.must_change_password ? 'Да' : 'Нет'}
                        </strong>
                      </div>
                    </div>

                    {/* Active Deposits Sub-list */}
                    <div className="space-y-2 pt-3 border-t border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Вклады ребенка ({childActiveDeposits.length}):</span>
                      {childActiveDeposits.length === 0 ? (
                        <p className="text-[11px] text-slate-500 bg-slate-950 p-2.5 rounded-xl border border-slate-950 text-center font-mono">Нет активных вкладов</p>
                      ) : (
                        <div className="space-y-1.5">
                          {childActiveDeposits.map(d => (
                            <div key={d.id} className="bg-slate-950 hover:bg-slate-950/80 border border-slate-850 rounded-xl px-3 py-2 flex justify-between items-center transition shadow-sm">
                              <div className="space-y-0.5 truncate min-w-0 pr-2">
                                <button
                                  type="button"
                                  onClick={() => handleViewDepositDetails(d)}
                                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer text-left truncate block w-full"
                                >
                                  {d.goal_icon || '💰'} {d.goal_title || d.bank_name}
                                </button>
                                <div className="text-[9px] text-slate-500 font-mono flex items-center gap-1.5 truncate">
                                  <span>Баланс: <strong className="text-slate-300">{formatKopecks(d.calculated_balance_kopecks)}</strong></span>
                                  <span className="text-slate-700">|</span>
                                  <span>Ставка: <strong>{(d.locked_interest_rate_bps / 100).toFixed(1)}%</strong></span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleFastReward(c, d)}
                                className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 hover:border-indigo-500 rounded-lg p-1.5 transition text-[10px] font-bold shrink-0 font-mono flex items-center justify-center shadow-inner"
                                title="Поощрить этот вклад"
                              >
                                🎁
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 mt-5 pt-3 border-t border-slate-800/30">
                    <button
                      onClick={() => handleOpenRewardModal(c)}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg py-2 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow"
                    >
                      <span>🎁 Поощрить</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowResetPassModal(c);
                        setResetPassForm({ temporaryPassword: '' });
                      }}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg py-2 text-xs font-semibold transition flex items-center justify-center gap-1"
                    >
                      <Key className="h-3.5 w-3.5 text-slate-400" />
                      <span>Сбросить пароль</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Global Admin: Families Panel */}
      {user.platformRole === 'global_admin' && activeTab === 'global_families' && (
        <section className="space-y-6">
          <div className="flex gap-3 max-w-lg">
            <input
              type="text"
              placeholder="Поиск семьи по названию или slug..."
              value={searchFamilyQuery}
              onChange={(e) => setSearchFamilyQuery(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 text-slate-100 text-sm rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none transition"
            />
            <button
              onClick={fetchData}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow"
            >
              Найти
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800/80">
                  <th className="p-4">Название Семьи</th>
                  <th className="p-4">Адрес (Slug)</th>
                  <th className="p-4">Создатель</th>
                  <th className="p-4">Кол-во участников</th>
                  <th className="p-4">Дата создания</th>
                  <th className="p-4 text-center">Статус</th>
                  <th className="p-4 text-center">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans text-slate-300">
                {globalFamilies.map(f => (
                  <tr key={f.id} className="hover:bg-slate-950/40 transition">
                    <td className="p-4 font-bold text-slate-200">{f.name}</td>
                    <td className="p-4 font-mono text-indigo-400">{f.slug}</td>
                    <td className="p-4">{f.creator_name || 'Система'}</td>
                    <td className="p-4 font-mono">{f.members_count} чел.</td>
                    <td className="p-4 font-mono">{new Date(f.created_at).toLocaleDateString()}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        f.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {getStatusText(f.status)}
                      </span>
                    </td>
                    <td className="p-4 flex justify-center gap-2">
                      {f.status === 'active' ? (
                        <button
                          onClick={() => handleBlockFamily(f.id)}
                          className="bg-red-950/20 hover:bg-red-950/40 text-red-400 hover:border-red-900/30 border border-red-950/40 rounded px-2.5 py-1 transition"
                        >
                          Блокировать
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivateFamily(f.id)}
                          className="bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-400 hover:border-emerald-900/30 border border-emerald-950/40 rounded px-2.5 py-1 transition"
                        >
                          Активировать
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteFamily(f.id)}
                        className="bg-slate-950 hover:bg-rose-950/40 hover:text-rose-400 border border-slate-800 rounded p-1 transition"
                        title="Soft delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Global Admin: System Audit Logs */}
      {user.platformRole === 'global_admin' && activeTab === 'audit_logs' && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-200">Платформенный Журнал Аудита (Audit Logs)</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="space-y-2.5 max-h-[600px] overflow-y-auto">
              {auditLogs.map(log => (
                <div key={log.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono space-y-1.5 leading-relaxed">
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Семья: <strong className="text-slate-300">{log.family_name || 'Не указана'}</strong></span>
                    <span>{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-indigo-400 font-bold uppercase text-[10px]">{log.action}</span>
                    <span className="text-slate-500">актор:</span>
                    <strong className="text-slate-300">{log.actor_name || 'Система'} (ID: {log.actor_user_id})</strong>
                  </div>
                  {log.reason && (
                    <p className="bg-slate-900 p-2 rounded text-slate-400 mt-1 border border-slate-800/40">
                      <strong>Причина / Описание:</strong> {log.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* MODAL: Reset Password */}
      {showResetPassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Key className="h-4 w-4 text-indigo-400" />
                <span>Временный пароль для {showResetPassModal.display_name}</span>
              </h3>
              <button onClick={() => setShowResetPassModal(null)} className="text-slate-400 hover:text-slate-100 text-xl font-bold">&times;</button>
            </div>

            <form onSubmit={handleResetChildPasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="temp-pass" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Новый временный пароль ребенка</label>
                <input
                  id="temp-pass"
                  type="text"
                  placeholder="Минимум 6 символов"
                  required
                  value={resetPassForm.temporaryPassword}
                  onChange={(e) => setResetPassForm({ temporaryPassword: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                />
                <small className="text-[10px] text-slate-500 block mt-1">Ребенку будет необходимо изменить его при следующем входе.</small>
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-800 pt-3">
                <button type="button" onClick={() => setShowResetPassModal(null)} className="bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs font-semibold px-4 py-2 rounded-lg border border-slate-800 transition">Отмена</button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">Установить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Child */}
      {showAddChildModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-indigo-400" />
                <span>Добавить Ребенка в семью</span>
              </h3>
              <button onClick={() => setShowAddChildModal(false)} className="text-slate-400 hover:text-slate-100 text-xl font-bold">&times;</button>
            </div>

            <form onSubmit={handleAddChildSubmit} className="space-y-4 text-xs">
              <div>
                <label htmlFor="child-username" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Логин ребенка (англ., без пробелов)</label>
                <input
                  id="child-username"
                  type="text"
                  placeholder="masha"
                  required
                  value={childForm.username}
                  onChange={(e) => setChildForm({ ...childForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                />
              </div>

              <div>
                <label htmlFor="child-display" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Имя ребенка</label>
                <input
                  id="child-display"
                  type="text"
                  placeholder="Маша"
                  required
                  value={childForm.displayName}
                  onChange={(e) => setChildForm({ ...childForm, displayName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                />
              </div>

              <div>
                <label htmlFor="child-pass" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Временный пароль ребенка</label>
                <input
                  id="child-pass"
                  type="text"
                  placeholder="Минимум 6 символов"
                  required
                  value={childForm.temporaryPassword}
                  onChange={(e) => setChildForm({ ...childForm, temporaryPassword: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                />
              </div>

              <div>
                <label htmlFor="child-birth" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Дата рождения</label>
                <input
                  id="child-birth"
                  type="date"
                  value={childForm.birthDate}
                  onChange={(e) => setChildForm({ ...childForm, birthDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                />
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-800 pt-3">
                <button type="button" onClick={() => setShowAddChildModal(false)} className="bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs font-semibold px-4 py-2 rounded-lg border border-slate-800 transition">Отмена</button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">Добавить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Bank */}
      {showAddBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-indigo-400" />
                <span>Создать Семейный Банк</span>
              </h3>
              <button onClick={() => setShowAddBankModal(false)} className="text-slate-400 hover:text-slate-100 text-xl font-bold">&times;</button>
            </div>

            <form onSubmit={handleCreateBank} className="space-y-4 text-xs">
              <div>
                <label htmlFor="bank-name" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Название банка</label>
                <input
                  id="bank-name"
                  type="text"
                  placeholder="Копилка желаний, Супер-вклад 2026..."
                  required
                  value={bankForm.name}
                  onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none transition"
                />
              </div>

              <div>
                <label htmlFor="bank-desc" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Короткое описание</label>
                <input
                  id="bank-desc"
                  type="text"
                  placeholder="На летний отпуск, покупки или мечту"
                  value={bankForm.description}
                  onChange={(e) => setBankForm({ ...bankForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bank-rate" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ставка в б.п. (1% = 100 б.п.)</label>
                  <input
                    id="bank-rate"
                    type="number"
                    placeholder="400"
                    required
                    value={bankForm.interestRateBps}
                    onChange={(e) => setBankForm({ ...bankForm, interestRateBps: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label htmlFor="bank-period" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Период начисления (дней)</label>
                  <input
                    id="bank-period"
                    type="number"
                    placeholder="30"
                    required
                    value={bankForm.periodDays}
                    onChange={(e) => setBankForm({ ...bankForm, periodDays: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bank-min" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Мин. вклад (₽)</label>
                  <input
                    id="bank-min"
                    type="number"
                    placeholder="1000"
                    required
                    value={bankForm.minimumDepositRubles}
                    onChange={(e) => setBankForm({ ...bankForm, minimumDepositRubles: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label htmlFor="bank-max" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Макс. лимит / реб. (₽)</label>
                  <input
                    id="bank-max"
                    type="number"
                    placeholder="Без лимита"
                    value={bankForm.maximumDepositRubles}
                    onChange={(e) => setBankForm({ ...bankForm, maximumDepositRubles: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bank-penalty" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Досрочный штраф (б.п.)</label>
                  <input
                    id="bank-penalty"
                    type="number"
                    placeholder="200"
                    required
                    value={bankForm.earlyWithdrawalPenaltyBps}
                    onChange={(e) => setBankForm({ ...bankForm, earlyWithdrawalPenaltyBps: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label htmlFor="bank-holding" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Мин. удержание (дней)</label>
                  <input
                    id="bank-holding"
                    type="number"
                    placeholder="0"
                    required
                    value={bankForm.minimumHoldingDays}
                    onChange={(e) => setBankForm({ ...bankForm, minimumHoldingDays: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              {/* V2 Top-up rules configurations */}
              <div className="border-t border-slate-800 pt-3.5 space-y-3.5">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span>Правила пополнения вкладов (v2)</span>
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="allow-top-up-checkbox"
                      type="checkbox"
                      checked={bankForm.allowTopUp}
                      onChange={(e) => setBankForm({ ...bankForm, allowTopUp: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 bg-slate-950 border-slate-800 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="allow-top-up-checkbox" className="text-xs font-semibold text-slate-300">Разрешить пополнение открытых вкладов</label>
                  </div>

                  {bankForm.allowTopUp && (
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase">Мин. сумма одного пополнения (₽):</label>
                      <input
                        type="number"
                        placeholder="100"
                        value={bankForm.minimumTopUpRubles}
                        onChange={(e) => setBankForm({ ...bankForm, minimumTopUpRubles: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-1.5 font-mono outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>

                {bankForm.allowTopUp && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase">Макс. сумма одного пополнения (₽):</label>
                      <input
                        type="number"
                        placeholder="Без лимита"
                        value={bankForm.maximumTopUpRubles}
                        onChange={(e) => setBankForm({ ...bankForm, maximumTopUpRubles: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-1.5 font-mono outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase">Предел общего баланса вклада (₽):</label>
                      <input
                        type="number"
                        placeholder="Без лимита"
                        value={bankForm.maximumTotalDepositPerChildRubles}
                        onChange={(e) => setBankForm({ ...bankForm, maximumTotalDepositPerChildRubles: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-1.5 font-mono outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase">Режим начисления процентов:</label>
                  <select
                    value={bankForm.interestAccrualMode}
                    onChange={(e) => setBankForm({ ...bankForm, interestAccrualMode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="whole_balance_on_schedule">Простой (капитализация на весь баланс в день общего расписания)</option>
                    <option value="per_contribution_period">Реалистичный (каждый взнос имеет индивидуальный график и период)</option>
                  </select>
                  <small className="text-[10px] text-slate-500 block leading-relaxed mt-1">
                    В **Реалистичном режиме** проценты начисляются индивидуально по каждому взносу/пополнению ровно через {bankForm.periodDays || 30} дней с момента его одобрения.
                  </small>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bank-color" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Цвет бренда</label>
                  <input
                    id="bank-color"
                    type="color"
                    value={bankForm.color}
                    onChange={(e) => setBankForm({ ...bankForm, color: e.target.value })}
                    className="w-8 h-8 rounded-full border border-slate-800 cursor-pointer block"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-800 pt-3">
                <button type="button" onClick={() => setShowAddBankModal(false)} className="bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs font-semibold px-4 py-2 rounded-lg border border-slate-800 transition">Отмена</button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">Добавить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Bank */}
      {editingBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Settings className="h-4 w-4 text-indigo-400" />
                <span>Редактировать условия банка</span>
              </h3>
              <button onClick={() => setEditingBank(null)} className="text-slate-400 hover:text-slate-100 text-xl font-bold">&times;</button>
            </div>

            <form onSubmit={handleSaveBankChanges} className="space-y-4 text-xs">
              <div className="bg-amber-950/20 border border-amber-900/40 p-3 rounded-lg text-[10px] text-slate-400 leading-relaxed flex gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                <span>
                  <strong>Капитализация и аудит:</strong> При изменении ставки, периода или штрафов, дети получат автоматическое предложение о переходе по активным вкладам. Предыдущие накопленные проценты будут капитализированы.
                </span>
              </div>

              <div>
                <label htmlFor="edit-bank-name" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Название банка</label>
                <input
                  id="edit-bank-name"
                  type="text"
                  required
                  value={editingBank.name}
                  onChange={(e) => setEditingBank({ ...editingBank, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none transition"
                />
              </div>

              <div>
                <label htmlFor="edit-bank-desc" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Описание</label>
                <input
                  id="edit-bank-desc"
                  type="text"
                  value={editingBank.description}
                  onChange={(e) => setEditingBank({ ...editingBank, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-bank-rate" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ставка (б.п., 100 б.п. = 1%)</label>
                  <input
                    id="edit-bank-rate"
                    type="number"
                    required
                    value={editingBank.interest_rate_bps}
                    onChange={(e) => setEditingBank({ ...editingBank, interest_rate_bps: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label htmlFor="edit-bank-period" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Период (дней)</label>
                  <input
                    id="edit-bank-period"
                    type="number"
                    required
                    value={editingBank.period_days}
                    onChange={(e) => setEditingBank({ ...editingBank, period_days: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-bank-min" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Мин. вклад (₽)</label>
                  <input
                    id="edit-bank-min"
                    type="number"
                    required
                    value={editingBank.minimum_deposit_rubles}
                    onChange={(e) => setEditingBank({ ...editingBank, minimum_deposit_rubles: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label htmlFor="edit-bank-max" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Макс. лимит / реб (₽)</label>
                  <input
                    id="edit-bank-max"
                    type="number"
                    value={editingBank.maximum_deposit_rubles}
                    onChange={(e) => setEditingBank({ ...editingBank, maximum_deposit_rubles: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-bank-penalty" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Досрочный штраф (б.п.)</label>
                  <input
                    id="edit-bank-penalty"
                    type="number"
                    required
                    value={editingBank.early_withdrawal_penalty_bps}
                    onChange={(e) => setEditingBank({ ...editingBank, early_withdrawal_penalty_bps: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label htmlFor="edit-bank-holding" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Мин. удержание (дней)</label>
                  <input
                    id="edit-bank-holding"
                    type="number"
                    required
                    value={editingBank.minimum_holding_days}
                    onChange={(e) => setEditingBank({ ...editingBank, minimum_holding_days: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition"
                  />
                </div>
              </div>

              {/* V2 edit topup rules */}
              <div className="border-t border-slate-800 pt-3.5 space-y-3.5">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span>Редактирование правил пополнения (v2)</span>
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="edit-allow-top-up"
                      type="checkbox"
                      checked={editingBank.allow_top_up}
                      onChange={(e) => setEditingBank({ ...editingBank, allow_top_up: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 bg-slate-950 border-slate-800 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="edit-allow-top-up" className="text-xs font-semibold text-slate-300">Разрешить пополнение открытых вкладов</label>
                  </div>

                  {editingBank.allow_top_up && (
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase">Мин. сумма пополнения (₽):</label>
                      <input
                        type="number"
                        placeholder="100"
                        value={editingBank.minimum_top_up_rubles}
                        onChange={(e) => setEditingBank({ ...editingBank, minimum_top_up_rubles: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-1.5 font-mono outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>

                {editingBank.allow_top_up && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase">Макс. сумма пополнения (₽):</label>
                      <input
                        type="number"
                        placeholder="Без лимита"
                        value={editingBank.maximum_top_up_rubles}
                        onChange={(e) => setEditingBank({ ...editingBank, maximum_top_up_rubles: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-1.5 font-mono outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase">Предел общего баланса вклада (₽):</label>
                      <input
                        type="number"
                        placeholder="Без лимита"
                        value={editingBank.maximum_total_deposit_per_child_rubles}
                        onChange={(e) => setEditingBank({ ...editingBank, maximum_total_deposit_per_child_rubles: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-1.5 font-mono outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase">Режим начисления процентов:</label>
                  <select
                    value={editingBank.interest_accrual_mode}
                    onChange={(e) => setEditingBank({ ...editingBank, interest_accrual_mode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="whole_balance_on_schedule">Простой (капитализация на весь баланс в день общего расписания)</option>
                    <option value="per_contribution_period">Реалистичный (каждый взнос имеет индивидуальный график и период)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-800 pt-3">
                <button type="button" onClick={() => setEditingBank(null)} className="bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs font-semibold px-4 py-2 rounded-lg border border-slate-800 transition font-sans">Отмена</button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition font-sans">Сохранить Условия</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Parent Reward */}
      {showRewardModal && rewardChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 font-sans">
                <span>🎁</span>
                <span>Поощрить ребёнка</span>
              </h3>
              <button onClick={() => setShowRewardModal(false)} className="text-slate-400 hover:text-slate-100 text-xl font-bold">&times;</button>
            </div>

            {modalError && (
              <div className="bg-red-950/40 border border-red-800 text-red-300 text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {rewardStep === 'input' ? (
              <div className="space-y-4 text-xs font-sans">
                <div>
                  <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Ребёнок:</span>
                  <p className="text-sm font-bold text-slate-200">{rewardChild.display_name}</p>
                </div>

                {(() => {
                  const activeDeps = familyDeposits.filter(d => d.child_user_id === rewardChild.id && d.status === 'active');
                  const hasActive = activeDeps.length > 0;
                  
                  if (!hasActive) {
                    return (
                      <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4 text-center text-amber-300 space-y-2">
                        <AlertTriangle className="h-5 w-5 mx-auto text-amber-400 animate-pulse" />
                        <p className="font-semibold text-xs leading-relaxed">
                          Сначала ребёнку нужно открыть и дождаться одобрения хотя бы одного вклада.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div>
                        <label htmlFor="reward-dep-sel" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Вклад:</label>
                        {lockDepositSelector ? (
                          <div className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 text-sm font-semibold flex justify-between items-center">
                            <span>
                              {rewardDeposit?.goal_title ? rewardDeposit.goal_title : 'Вклад'} — {rewardDeposit?.bank_name}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              {rewardDeposit && formatKopecks(rewardDeposit.calculated_balance_kopecks)}
                            </span>
                          </div>
                        ) : (
                          <select
                            id="reward-dep-sel"
                            value={rewardDeposit ? rewardDeposit.id : ''}
                            onChange={(e) => {
                              const dep = activeDeps.find(d => d.id === parseInt(e.target.value, 10));
                              setRewardDeposit(dep);
                            }}
                            className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-sans focus:border-indigo-500 outline-none transition text-xs"
                          >
                            {activeDeps.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.goal_title ? d.goal_title : 'Вклад'} — {d.bank_name} · {formatKopecks(d.calculated_balance_kopecks)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div>
                        <label htmlFor="reward-amount" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Сумма поощрения (₽):</label>
                        <input
                          id="reward-amount"
                          type="number"
                          placeholder="300"
                          required
                          value={rewardForm.amountRubles}
                          onChange={(e) => setRewardForm({ ...rewardForm, amountRubles: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 font-mono focus:border-indigo-500 outline-none transition text-xs"
                        />
                      </div>

                      <div>
                        <label htmlFor="reward-notes" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Комментарий для {rewardChild.display_name}:</label>
                        <textarea
                          id="reward-notes"
                          rows="2"
                          placeholder="За помощь по дому"
                          required
                          value={rewardForm.notes}
                          onChange={(e) => setRewardForm({ ...rewardForm, notes: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 focus:border-indigo-500 outline-none transition text-xs"
                        />
                      </div>

                      {/* Live Preview */}
                      {rewardDeposit && rewardForm.amountRubles && parseFloat(rewardForm.amountRubles) > 0 && (
                        <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-3">
                          <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider block">После зачисления:</span>
                          
                          {(() => {
                            const amt = parseFloat(rewardForm.amountRubles) || 0;
                            const currentBalKop = rewardDeposit.calculated_balance_kopecks || 0;
                            const newBalKop = currentBalKop + (amt * 100);
                            const targetKop = rewardDeposit.goal_target_kopecks || 0;
                            const progressPercent = targetKop > 0 ? parseFloat(((newBalKop / targetKop) * 100).toFixed(2)) : 0;
                            
                            return (
                              <div className="space-y-2 text-xs font-sans">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Баланс вклада:</span>
                                  <strong className="text-slate-100 font-mono">{formatKopecks(newBalKop)}</strong>
                                </div>
                                {targetKop > 0 && (
                                  <>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Цель «{rewardDeposit.goal_title}»:</span>
                                      <strong className="text-slate-100 font-mono">
                                        {formatKopecks(newBalKop)} из {formatKopecks(targetKop)}
                                      </strong>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-400 font-sans">Прогресс:</span>
                                      <div className="flex items-center gap-2">
                                        <div className="w-24 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                                          <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.min(100, progressPercent)}%` }}></div>
                                        </div>
                                        <strong className="text-indigo-400 text-xs font-mono">{progressPercent}%</strong>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}

                          <div className="border-t border-slate-900 pt-2 text-[11px] leading-relaxed text-slate-400">
                            {rewardDeposit.locked_interest_accrual_mode === 'per_contribution_period' ? (
                              <div>
                                <span className="text-[10px] text-amber-400 uppercase font-bold tracking-wider block mb-0.5 font-mono">Реалистичный режим:</span>
                                На эту сумму первые проценты начислятся после полного периода — <strong>
                                  {(() => {
                                    const pDays = rewardDeposit.locked_period_days || 30;
                                    const futDate = new Date();
                                    futDate.setDate(futDate.getDate() + pDays);
                                    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
                                    return `${futDate.getDate()} ${months[futDate.getMonth()]}`;
                                  })()}
                                </strong>.
                              </div>
                            ) : (
                              <div>
                                <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider block mb-0.5 font-mono">Простой режим:</span>
                                Поощрение будет участвовать в следующем начислении процентов <strong>
                                  {(() => {
                                    let dDate = new Date();
                                    if (rewardDeposit.next_accrual_date) {
                                      dDate = new Date(rewardDeposit.next_accrual_date);
                                    } else {
                                      dDate.setDate(dDate.getDate() + 30);
                                    }
                                    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
                                    return `${dDate.getDate()} ${months[dDate.getMonth()]}`;
                                  })()}
                                </strong>.
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 justify-end border-t border-slate-800 pt-3">
                        <button type="button" onClick={() => setShowRewardModal(false)} className="bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs font-semibold px-4 py-2 rounded-lg border border-slate-800 transition">Отмена</button>
                        <button type="button" onClick={handleNextToConfirm} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow">Зачислить поощрение</button>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              /* Confirmation step */
              <div className="space-y-4 font-sans">
                <div className="text-center py-2">
                  <div className="w-12 h-12 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-full flex items-center justify-center text-xl mx-auto mb-2 animate-bounce">
                    🎁
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">Зачислить поощрение?</h4>
                  <p className="text-xs text-slate-400 mt-1">Подтвердите параметры перед переводом</p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 font-mono text-xs">
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-500 font-sans">Получатель:</span>
                    <strong className="text-slate-200">{rewardChild.display_name}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-500 font-sans">Получит:</span>
                    <strong className="text-emerald-400 text-sm font-bold">+{parseFloat(rewardForm.amountRubles).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-500 font-sans">На вклад:</span>
                    <strong className="text-slate-200 font-sans">«{rewardDeposit?.goal_title || rewardDeposit?.bank_name}»</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-2">
                    <span className="text-slate-500 font-sans">Комментарий:</span>
                    <strong className="text-slate-300 text-right max-w-[200px] break-words">«{rewardForm.notes}»</strong>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-500 font-sans">Отправитель:</span>
                    <strong className="text-indigo-400">{user.displayName || 'Родитель'}</strong>
                  </div>
                </div>

                <div className="flex gap-2 justify-end border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setRewardStep('input')}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs font-semibold px-4 py-2 rounded-lg border border-slate-800 transition"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    disabled={rewardLoading}
                    onClick={handleSubmitReward}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-1.5 shadow"
                  >
                    {rewardLoading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Зачисление...</span>
                      </>
                    ) : (
                      <span>Да, зачислить</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Deposit Details (Admin) */}
      {showDepositDetailsModal && detailedDepositAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{detailedDepositAdmin.goal_icon || '💰'}</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{detailedDepositAdmin.goal_title || 'Детали вклада'}</h3>
                  <span className="text-[10px] text-slate-400 block font-mono">{detailedDepositAdmin.bank_name}</span>
                </div>
              </div>
              <button onClick={() => setShowDepositDetailsModal(false)} className="text-slate-400 hover:text-slate-100 text-xl font-bold">&times;</button>
            </div>

            <div className="space-y-4 text-xs font-sans">
              {detailedDepositAdmin.goal_note && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 text-slate-400 leading-relaxed font-sans italic">
                  &ldquo;{detailedDepositAdmin.goal_note}&rdquo;
                </div>
              )}

              {/* Goal metrics if any */}
              {detailedDepositAdmin.goal_target_kopecks && (
                <div className="bg-slate-950/60 p-4 border border-slate-850 rounded-xl space-y-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Прогресс к цели:</span>
                  <div className="flex justify-between font-mono text-xs">
                    <span className="font-sans text-slate-400">Накоплено: <strong className="text-indigo-400">{formatKopecks(detailedDepositAdmin.calculated_balance_kopecks)}</strong></span>
                    <span className="font-sans text-slate-400">Цель: <strong className="text-slate-300">{formatKopecks(detailedDepositAdmin.goal_target_kopecks)}</strong></span>
                  </div>
                  <div className="relative w-full bg-slate-900 rounded-full h-3.5 overflow-hidden border border-slate-800 flex items-center">
                    <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, (detailedDepositAdmin.calculated_balance_kopecks / detailedDepositAdmin.goal_target_kopecks) * 100)}%` }}></div>
                    <span className="absolute right-2 font-mono font-bold text-[9px] text-white">
                      {((detailedDepositAdmin.calculated_balance_kopecks / detailedDepositAdmin.goal_target_kopecks) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Financial Balance Breakdown */}
              <div className="grid grid-cols-2 gap-3 text-xs font-sans">
                <div className="bg-slate-950 border border-slate-900 rounded-xl p-3">
                  <span className="text-slate-500 block mb-0.5">Первый взнос:</span>
                  <strong className="text-slate-200 font-mono text-sm">{formatKopecks(detailedDepositAdmin.initial_amount_kopecks)}</strong>
                </div>
                <div className="bg-slate-950 border border-slate-900 rounded-xl p-3">
                  <span className="text-slate-500 block mb-0.5">Заработано процентов:</span>
                  <strong className="text-emerald-400 font-mono text-sm">+{formatKopecks(detailedDepositAdmin.earned_interest_kopecks)}</strong>
                </div>
              </div>

              {/* Conditions / Accrual Info */}
              <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Установленная ставка:</span>
                  <strong className="text-slate-200">{(detailedDepositAdmin.locked_interest_rate_bps / 100).toFixed(2)}%</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Режим процентов:</span>
                  <strong className="text-slate-300">
                    {detailedDepositAdmin.locked_interest_accrual_mode === 'per_contribution_period' ? 'Реалистичный (по взносам)' : 'Простой (по графику)'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Период вклада:</span>
                  <strong className="text-slate-300">{detailedDepositAdmin.locked_period_days} дней</strong>
                </div>
                {detailedDepositAdmin.status === 'active' && (
                  <div className="flex justify-between border-t border-slate-800 pt-2 font-sans text-xs">
                    <span className="text-slate-400">Следующее начисление:</span>
                    <strong className="text-indigo-400 font-mono">
                      {detailedDepositAdmin.next_accrual_date ? new Date(detailedDepositAdmin.next_accrual_date).toLocaleDateString() : 'Скоро'}
                    </strong>
                  </div>
                )}
              </div>

              {/* History of Operations */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block font-sans">История транзакций ({detailedDepositAdmin.operations?.length || 0}):</span>
                {detailedDepositAdmin.operations?.length === 0 ? (
                  <p className="text-[11px] text-slate-500 bg-slate-950 p-4 rounded-xl text-center border border-slate-900 font-mono">Транзакций пока нет</p>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {detailedDepositAdmin.operations?.map(op => (
                      <div key={op.id} className="bg-slate-950 border border-slate-900/60 rounded-xl p-3 flex justify-between items-start text-xs font-mono">
                        <div className="space-y-1">
                          <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded ${
                            op.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                            op.status === 'pending' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            {op.type === 'open' ? 'Открытие' :
                             op.type === 'top_up' ? 'Пополнение' :
                             op.type === 'withdraw' ? 'Снятие' :
                             op.type === 'parent_reward' ? 'Поощрение' : op.type}
                          </span>
                          <p className="text-slate-300 text-[11px] font-sans mt-1">{op.notes || 'Без комментария'}</p>
                          <span className="text-[9px] text-slate-500 block">
                            {new Date(op.requested_at).toLocaleDateString()} · от {op.requested_by_name}
                          </span>
                        </div>
                        <strong className={`text-sm ${
                          op.type === 'withdraw' ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {op.type === 'withdraw' ? '-' : '+'}{formatKopecks(op.amount_kopecks)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Rewards Button */}
              {detailedDepositAdmin.status === 'active' && (
                <div className="pt-2 border-t border-slate-800">
                  <button
                    onClick={() => {
                      const child = childrenList.find(childObj => childObj.id === detailedDepositAdmin.child_user_id);
                      if (child) {
                        setShowDepositDetailsModal(false);
                        handleFastReward(child, detailedDepositAdmin);
                      }
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <span>🎁 Поощрить этот вклад</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
