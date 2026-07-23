import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  DollarSign, TrendingUp, PiggyBank, Plus, Eye, Clock, BarChart3, LogOut, 
  RefreshCw, Check, X, AlertTriangle, Calendar, Info, Target, Trash2, Edit2, ShieldAlert,
  Bell
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  CartesianGrid, Legend, LineChart, Line, ReferenceLine 
} from 'recharts';

const ChildDashboard = ({ user, onLogout }) => {
  const [deposits, setDeposits] = useState([]);
  const [stats, setStats] = useState({
    total_invested_kopecks: 0,
    total_current_balance_kopecks: 0,
    total_interest_earned_kopecks: 0,
    active_deposits_count: 0,
    total_deposits_count: 0,
    recent_operations: []
  });
  
  const [activeBanks, setActiveBanks] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const [showNewDepositModal, setShowNewDepositModal] = useState(false);
  const [newDepositForm, setNewDepositForm] = useState({
    bankId: '',
    amountRubles: '',
    // Goal fields
    goalTitle: '',
    goalTargetRubles: '',
    goalIcon: '🎯',
    goalNote: '',
    goalDueDate: ''
  });
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewDepositForm(prev => ({ ...prev, [name]: value }));
  };
  
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [detailedDepositData, setDetailedDepositData] = useState(null);

  // States for interactive calculator
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [calculatorForm, setCalculatorForm] = useState({
    bankId: '',
    amountRubles: '2000',
    periods: 12,
    regularTopUpRubles: '0',
    goalTargetRubles: ''
  });
  const [calculatorResult, setCalculatorResult] = useState(null);
  const [calculatorLoading, setCalculatorLoading] = useState(false);
  const [calculatorError, setCalculatorError] = useState('');

  // States for detailed deposit modal tabs
  const [detailsTab, setDetailsTab] = useState('forecast'); // 'forecast', 'topup', 'goal', 'withdrawal'
  const [withdrawalDate, setWithdrawalDate] = useState(new Date().toISOString().split('T')[0]);
  const [withdrawalData, setWithdrawalData] = useState(null);
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);

  // Goal update state
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: '',
    targetRubles: '',
    icon: '🎯',
    note: '',
    dueDate: ''
  });

  // Top-up request state
  const [topUpAmountRubles, setTopUpAmountRubles] = useState('');
  const [topUpError, setTopUpError] = useState('');
  const [topUpSuccess, setTopUpSuccess] = useState('');

  // Standalone Top-Up Modal state
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpDeposit, setTopUpDeposit] = useState(null);
  const [topUpConfirmStep, setTopUpConfirmStep] = useState(false);
  const [topUpSubmitting, setTopUpSubmitting] = useState(false);

  const handleOpenTopUpModal = (deposit) => {
    setTopUpDeposit(deposit);
    setTopUpAmountRubles('500');
    setTopUpError('');
    setTopUpConfirmStep(false);
    setShowTopUpModal(true);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');

      // 1. Fetch deposits
      const depRes = await axios.get('/deposits');
      setDeposits(depRes.data);

      // 2. Fetch stats
      const statsRes = await axios.get(`/analytics/child/${user.id}`);
      setStats(statsRes.data);

      // 3. Fetch active bank templates
      const banksRes = await axios.get('/banks');
      setActiveBanks(banksRes.data);
      if (banksRes.data.length > 0) {
        setNewDepositForm(prev => ({ 
          ...prev, 
          bankId: banksRes.data[0].id.toString() 
        }));
      }

      // 4. Fetch rate proposals
      const propRes = await axios.get('/rate-change-proposals');
      setProposals(propRes.data);

      // 5. Fetch notifications
      const notifRes = await axios.get('/notifications');
      setNotifications(notifRes.data);

    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeposit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    const rubles = parseFloat(newDepositForm.amountRubles);
    if (isNaN(rubles) || rubles <= 0) {
      setError('Укажите корректную сумму вклада.');
      return;
    }

    const kopecks = Math.round(rubles * 100);

    let goalTargetKopecks = null;
    if (newDepositForm.goalTargetRubles) {
      const targetVal = parseFloat(newDepositForm.goalTargetRubles);
      if (!isNaN(targetVal) && targetVal > 0) {
        goalTargetKopecks = Math.round(targetVal * 100);
      }
    }

    try {
      const response = await axios.post('/deposits/request-open', {
        bankId: parseInt(newDepositForm.bankId, 10),
        amountKopecks: kopecks,
        goalTitle: newDepositForm.goalTitle || null,
        goalTargetKopecks,
        goalIcon: newDepositForm.goalIcon || '🎯',
        goalNote: newDepositForm.goalNote || null,
        goalDueDate: newDepositForm.goalDueDate || null
      });

      setSuccessMessage(response.data.message);
      setShowNewDepositModal(false);
      setNewDepositForm({
        bankId: activeBanks.length > 0 ? activeBanks[0].id.toString() : '',
        amountRubles: '',
        goalTitle: '',
        goalTargetRubles: '',
        goalIcon: '🎯',
        goalNote: '',
        goalDueDate: ''
      });
      fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить заявку.');
    }
  };

  const handleRequestWithdrawal = async (depositId) => {
    setError('');
    setSuccessMessage('');

    if (!window.confirm('Вы действительно хотите запросить закрытие этого вклада?')) {
      return;
    }

    try {
      const response = await axios.post(`/deposits/${depositId}/request-close`);
      setSuccessMessage(response.data.message);
      setSelectedDeposit(null);
      fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось запросить снятие средств.');
    }
  };

  const handleViewDetails = async (deposit) => {
    setSelectedDeposit(deposit);
    setDetailedDepositData(null);
    setDetailsTab('forecast');
    setWithdrawalDate(new Date().toISOString().split('T')[0]);
    setWithdrawalData(null);
    setEditingGoal(false);
    setTopUpAmountRubles('');
    setTopUpError('');
    setTopUpSuccess('');
    
    try {
      // 1. Get detailed deposit details with goal etc
      const res = await axios.get(`/deposits/${deposit.id}`);
      
      // 2. Get 12-period analytics forecast
      const forecastRes = await axios.get(`/analytics/forecast/${deposit.id}`);
      
      setDetailedDepositData({
        ...res.data,
        analytics: forecastRes.data
      });

      // Populate goal form for quick edit
      if (res.data.goal) {
        setGoalForm({
          title: res.data.goal_title || '',
          targetRubles: ((res.data.goal_target_kopecks || 0) / 100).toString(),
          icon: res.data.goal_icon || '🎯',
          note: res.data.goal_note || '',
          dueDate: res.data.goal_due_date || ''
        });
      } else {
        setGoalForm({
          title: '',
          targetRubles: '',
          icon: '🎯',
          note: '',
          dueDate: ''
        });
      }

      // 3. Get initial withdrawal preview (default for today)
      if (deposit.status === 'active' || deposit.status === 'pending_close') {
        const withdrawalRes = await axios.post('/analytics/early-withdrawal-preview', {
          depositId: deposit.id,
          withdrawalDate: new Date().toISOString().split('T')[0],
          comparePeriods: 12
        });
        setWithdrawalData(withdrawalRes.data);
      }
    } catch (err) {
      console.error('Error fetching details:', err);
    }
  };

  const handleOpenNotification = async (notif) => {
    try {
      await axios.post(`/notifications/${notif.id}/read`);
      
      // Refresh notifications list to mark it visually as read
      const notifRes = await axios.get('/notifications');
      setNotifications(notifRes.data);

      if (notif.deposit_id) {
        const deposit = deposits.find(d => d.id === notif.deposit_id);
        if (deposit) {
          handleViewDetails(deposit);
        }
      }
    } catch (err) {
      console.error('Failed to open notification:', err);
    }
  };

  const handleWithdrawalDateChange = async (dateStr) => {
    setWithdrawalDate(dateStr);
    if (!selectedDeposit) return;
    setWithdrawalLoading(true);
    try {
      const withdrawalRes = await axios.post('/analytics/early-withdrawal-preview', {
        depositId: selectedDeposit.id,
        withdrawalDate: dateStr,
        comparePeriods: 12
      });
      setWithdrawalData(withdrawalRes.data);
    } catch (err) {
      console.error('Error updating withdrawal date preview:', err);
    } finally {
      setWithdrawalLoading(false);
    }
  };

  const handleOpenCalculator = () => {
    setShowCalculatorModal(true);
    setCalculatorError('');
    const defaultBankId = activeBanks.length > 0 ? activeBanks[0].id.toString() : '';
    const initialForm = {
      bankId: defaultBankId,
      amountRubles: '2000',
      periods: 12,
      regularTopUpRubles: '0',
      goalTargetRubles: ''
    };
    setCalculatorForm(initialForm);
    triggerCalculatorSimulation(initialForm);
  };

  const handleCalculatorChange = (e) => {
    const { name, value } = e.target;
    setCalculatorForm(prev => {
      const updated = { ...prev, [name]: value };
      triggerCalculatorSimulation(updated);
      return updated;
    });
  };

  const triggerCalculatorSimulation = async (form) => {
    if (!form.bankId || !form.amountRubles) return;
    
    const rubles = parseFloat(form.amountRubles);
    if (isNaN(rubles) || rubles <= 0) return;
    
    setCalculatorLoading(true);
    setCalculatorError('');
    try {
      const response = await axios.post('/analytics/calculator', {
        bankId: parseInt(form.bankId, 10),
        principalKopecks: Math.round(rubles * 100),
        periods: parseInt(form.periods, 10) || 12,
        regularTopUpKopecks: form.regularTopUpRubles ? Math.round(parseFloat(form.regularTopUpRubles) * 100) : 0,
        goalTargetKopecks: form.goalTargetRubles ? Math.round(parseFloat(form.goalTargetRubles) * 100) : null
      });
      setCalculatorResult(response.data);
    } catch (err) {
      setCalculatorError(err.response?.data?.error || 'Ошибка симуляции расчета');
      setCalculatorResult(null);
    } finally {
      setCalculatorLoading(false);
    }
  };

  const handleTryToSave = () => {
    setNewDepositForm({
      bankId: calculatorForm.bankId,
      amountRubles: calculatorForm.amountRubles,
      goalTitle: calculatorForm.goalTargetRubles ? 'Цель из калькулятора' : '',
      goalTargetRubles: calculatorForm.goalTargetRubles || '',
      goalIcon: '🎯',
      goalNote: calculatorForm.regularTopUpRubles && parseFloat(calculatorForm.regularTopUpRubles) > 0 
        ? `Запланировано регулярное пополнение: ${calculatorForm.regularTopUpRubles} ₽ за период` 
        : '',
      goalDueDate: ''
    });
    setShowCalculatorModal(false);
    setShowNewDepositModal(true);
  };

  const handleAcceptProposal = async (proposalId) => {
    setError('');
    setSuccessMessage('');
    try {
      const res = await axios.post(`/rate-change-proposals/${proposalId}/accept`);
      setSuccessMessage(res.data.message);
      fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось принять условия.');
    }
  };

  const handleRejectProposal = async (proposalId) => {
    setError('');
    setSuccessMessage('');
    try {
      const res = await axios.post(`/rate-change-proposals/${proposalId}/reject`);
      setSuccessMessage(res.data.message);
      fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отклонить условия.');
    }
  };

  // Deposit top-up submission
  const handleRequestTopUpSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDeposit) return;
    setTopUpError('');
    setTopUpSuccess('');

    const rubles = parseFloat(topUpAmountRubles);
    if (isNaN(rubles) || rubles <= 0) {
      setTopUpError('Укажите корректную сумму пополнения.');
      return;
    }

    try {
      const res = await axios.post(`/deposits/${selectedDeposit.id}/top-ups`, {
        amountKopecks: Math.round(rubles * 100)
      });
      setTopUpSuccess(res.data.message);
      setTopUpAmountRubles('');
      // Refresh current modal & backend stats
      const detailRes = await axios.get(`/deposits/${selectedDeposit.id}`);
      const forecastRes = await axios.get(`/analytics/forecast/${selectedDeposit.id}`);
      setDetailedDepositData({
        ...detailRes.data,
        analytics: forecastRes.data
      });
      fetchDashboardData();
    } catch (err) {
      setTopUpError(err.response?.data?.error || 'Ошибка при отправке заявки на пополнение.');
    }
  };

  // Edit / create / delete deposit goal
  const handleSaveGoal = async (e) => {
    e.preventDefault();
    if (!selectedDeposit) return;
    setTopUpError(''); // Clear top-up errors on goal action
    setTopUpSuccess('');

    const targetRub = parseFloat(goalForm.targetRubles);
    if (!goalForm.title || isNaN(targetRub) || targetRub <= 0) {
      setTopUpError('Заполните название и корректную сумму цели!');
      return;
    }

    try {
      const res = await axios.put(`/deposits/${selectedDeposit.id}/goal`, {
        title: goalForm.title,
        targetKopecks: Math.round(targetRub * 100),
        icon: goalForm.icon || '🎯',
        note: goalForm.note || null,
        dueDate: goalForm.dueDate || null
      });
      setEditingGoal(false);
      // Refresh details
      const detailRes = await axios.get(`/deposits/${selectedDeposit.id}`);
      const forecastRes = await axios.get(`/analytics/forecast/${selectedDeposit.id}`);
      setDetailedDepositData({
        ...detailRes.data,
        analytics: forecastRes.data
      });
      fetchDashboardData();
    } catch (err) {
      setTopUpError(err.response?.data?.error || 'Не удалось сохранить цель.');
    }
  };

  const handleDeleteGoal = async () => {
    if (!selectedDeposit) return;
    if (!window.confirm('Вы уверены, что хотите удалить цель накопления?')) return;
    setTopUpError('');
    setTopUpSuccess('');

    try {
      await axios.delete(`/deposits/${selectedDeposit.id}/goal`);
      setGoalForm({
        title: '',
        targetRubles: '',
        icon: '🎯',
        note: '',
        dueDate: ''
      });
      setEditingGoal(false);
      // Refresh details
      const detailRes = await axios.get(`/deposits/${selectedDeposit.id}`);
      const forecastRes = await axios.get(`/analytics/forecast/${selectedDeposit.id}`);
      setDetailedDepositData({
        ...detailRes.data,
        analytics: forecastRes.data
      });
      fetchDashboardData();
    } catch (err) {
      setTopUpError(err.response?.data?.error || 'Не удалось удалить цель.');
    }
  };

  const formatKopecks = (kopecks) => {
    return ((kopecks || 0) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return 'Активен';
      case 'pending_open': return 'На одобрении (Открытие)';
      case 'pending_close': return 'На одобрении (Закрытие)';
      case 'rejected': return 'Отклонен';
      case 'closed': return 'Закрыт';
      default: return status;
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      case 'pending_open': return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
      case 'pending_close': return 'bg-orange-500/10 text-orange-400 border border-orange-500/30';
      case 'rejected': return 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
      case 'closed': return 'bg-slate-500/10 text-slate-400 border border-slate-500/30';
      default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/30';
    }
  };

  if (loading && deposits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-slate-400 font-mono">Загрузка кабинета ребенка...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 border border-slate-800 rounded-2xl p-6 gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧒</span>
            <h1 className="text-2xl font-bold text-slate-100">Личный Кабинет</h1>
          </div>
          <p className="text-sm text-slate-400">
            Привет, <strong className="text-indigo-400">{user.displayName}</strong>! Пора копить и зарабатывать проценты!
          </p>
        </div>
        <div className="flex items-center gap-3 self-stretch sm:self-auto">
          <button
            id="btn-refresh-child"
            onClick={fetchDashboardData}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Обновить</span>
          </button>
          <button
            id="btn-open-calculator"
            onClick={handleOpenCalculator}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-300 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
          >
            <span>🧮</span>
            <span>Калькулятор вкладов</span>
          </button>
          <button
            id="btn-new-deposit"
            onClick={() => setShowNewDepositModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="h-4 w-4" />
            <span>Новый Вклад</span>
          </button>
          <button
            id="btn-logout"
            onClick={onLogout}
            className="bg-slate-950 hover:bg-rose-950/40 hover:text-rose-400 text-slate-400 rounded-xl p-2.5 border border-slate-800 hover:border-rose-900 transition"
            title="Выйти"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-950/40 border border-red-800 text-red-300 text-sm p-4 rounded-xl flex items-start gap-2 animate-pulse">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-sm p-4 rounded-xl">
          {successMessage}
        </div>
      )}

      {/* Unread Notifications Section */}
      {notifications.filter(n => !n.is_read).length > 0 && (
        <section className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-indigo-400">
            <Bell className="h-5 w-5 animate-pulse" />
            <h2 className="text-sm font-bold uppercase tracking-wider font-sans">Новые уведомления ({notifications.filter(n => !n.is_read).length})</h2>
          </div>
          <div className="space-y-2">
            {notifications.filter(n => !n.is_read).map(notif => (
              <div 
                key={notif.id} 
                onClick={() => handleOpenNotification(notif)}
                className="bg-slate-950 hover:bg-slate-800/80 active:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-xl p-4 flex justify-between items-center gap-4 cursor-pointer transition shadow"
              >
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-200">{notif.title}</h3>
                  <p className="text-xs text-slate-400">{notif.message}</p>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    {new Date(notif.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-lg px-2.5 py-1.5 text-[10px] font-bold font-mono uppercase whitespace-nowrap shrink-0">
                  Посмотреть вклад
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dynamic Rate Proposals Notification Bar */}
      {proposals.length > 0 && (
        <section className="bg-gradient-to-r from-amber-950/30 to-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-bounce">📢</span>
            <div>
              <h2 className="text-lg font-bold text-amber-400 font-sans">Предложения новых условий по вкладам!</h2>
              <p className="text-xs text-slate-400">
                Взрослые обновили параметры банка. Ознакомьтесь с предложениями ниже. Если вы согласитесь, ваши вклады перейдут на новые параметры с капитализацией уже начисленных процентов.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {proposals.map(prop => (
              <div key={prop.id} className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Вклад #{prop.deposit_id} ({prop.bank_name})</h3>
                    <p className="text-xs text-slate-500">Предложено: {new Date(prop.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded font-medium">Ожидает решения</span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1">
                    <span className="text-slate-500 font-medium">Старые условия:</span>
                    <p className="font-bold text-slate-300">{(prop.old_interest_rate_bps / 100).toFixed(1)}% / {prop.old_period_days} дн.</p>
                  </div>
                  <div className="bg-indigo-950/30 p-3 rounded-lg border border-indigo-900/30 space-y-1">
                    <span className="text-indigo-400 font-medium">Новые условия:</span>
                    <p className="font-bold text-indigo-300">{(prop.new_interest_rate_bps / 100).toFixed(1)}% / {prop.new_period_days} дн.</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptProposal(prop.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg py-2 text-xs font-semibold transition"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Принять условия</span>
                  </button>
                  <button
                    onClick={() => handleRejectProposal(prop.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg py-2 text-xs font-semibold transition"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Оставить старые</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stats Section */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
          <div className="bg-indigo-500/10 text-indigo-400 p-3 rounded-xl border border-indigo-500/20">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">На счёте сейчас</span>
            <span className="text-xl font-bold text-slate-100 font-mono block">{formatKopecks(stats.total_current_balance_kopecks)}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
          <div className="bg-emerald-500/10 text-emerald-400 p-3 rounded-xl border border-emerald-500/20">
            <PiggyBank className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">Личные сбережения</span>
            <span className="text-xl font-bold text-slate-100 font-mono block">{formatKopecks(stats.total_invested_kopecks)}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
          <div className="bg-amber-500/10 text-amber-400 p-3 rounded-xl border border-amber-500/20">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">Накоплено процентов</span>
            <span className="text-xl font-bold text-slate-100 font-mono block">{formatKopecks(stats.total_interest_earned_kopecks)}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-4">
          <div className="bg-purple-500/10 text-purple-400 p-3 rounded-xl border border-purple-500/20">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider block">Активных вкладов</span>
            <span className="text-xl font-bold text-slate-100 font-mono block">{stats.active_deposits_count} из {stats.total_deposits_count}</span>
          </div>
        </div>
      </section>

      {/* Main Grid: My Deposits and History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Deposits List */}
        <section className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <span>💰</span>
            <span>Мои Вклады</span>
          </h2>

          {deposits.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 border-dashed rounded-2xl p-12 text-center space-y-4 shadow-inner">
              <PiggyBank className="h-12 w-12 text-slate-600 mx-auto" />
              <div>
                <h3 className="text-slate-300 font-bold">У вас пока нет активных вкладов</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Создайте запрос на открытие вклада в одном из доступных родительских семейных банков, чтобы ваши сбережения росли каждый день!
                </p>
              </div>
              <button
                onClick={() => setShowNewDepositModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-xs font-semibold transition"
              >
                Открыть первый вклад
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {deposits.map(dep => (
                <div
                  key={dep.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between hover:border-slate-700 transition space-y-4"
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold shadow"
                          style={{ backgroundColor: `${dep.bank_color || '#6366f1'}33`, color: dep.bank_color || '#6366f1' }}
                        >
                          🏦
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-200">{dep.bank_name}</h4>
                          <span className="text-[10px] text-slate-500 block">Вклад #{dep.id}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusBadgeClass(dep.status)}`}>
                        {getStatusText(dep.status)}
                      </span>
                    </div>

                    {/* Goal Progress Bar if goal set */}
                    {dep.goal_title && dep.goal_target_kopecks && (
                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/40 space-y-1.5">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400 font-medium truncate max-w-[150px]">
                            {dep.goal_icon || '🎯'} {dep.goal_title}
                          </span>
                          <span className="text-indigo-400 font-mono font-bold">
                            {Math.round((dep.calculated_balance_kopecks / dep.goal_target_kopecks) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" 
                            style={{ width: `${Math.min(100, Math.round((dep.calculated_balance_kopecks / dep.goal_target_kopecks) * 100))}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                          <span>Баланс: {((dep.calculated_balance_kopecks)/100).toFixed(0)} ₽</span>
                          <span>Цель: {((dep.goal_target_kopecks)/100).toFixed(0)} ₽</span>
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 font-mono">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Начальный вклад:</span>
                        <span className="text-slate-400 font-bold">{formatKopecks(dep.principal_kopecks)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Баланс сейчас:</span>
                        <span className="text-emerald-400 font-bold">{formatKopecks(dep.calculated_balance_kopecks)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Накоплено:</span>
                        <span className="text-indigo-400 font-bold">+{formatKopecks(dep.earned_interest_kopecks)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-500 px-1">
                      <span>Ставка: <strong>{(dep.locked_interest_rate_bps / 100).toFixed(1)}%</strong></span>
                      <span>Режим: <strong className="text-indigo-400/80">{dep.locked_interest_accrual_mode === 'per_contribution_period' ? 'Реалистичный' : 'Простой'}</strong></span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800/60">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleViewDetails(dep)}
                        className="flex-1 min-w-[100px] bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-300 rounded-lg py-2 px-3 text-xs font-semibold transition flex items-center justify-center gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Подробнее</span>
                      </button>

                      {dep.status === 'active' && (
                        <>
                          {(dep.bank_is_active !== false && (dep.allow_top_up === true || dep.allow_top_up === 1)) ? (
                            dep.has_pending_top_up ? (
                              <button
                                disabled
                                className="flex-1 min-w-[150px] bg-amber-950/40 text-amber-300 border border-amber-800/50 rounded-lg py-2 px-2 text-[11px] font-semibold cursor-not-allowed flex items-center justify-center gap-1"
                                title="Заявка на пополнение ожидает одобрения взрослого"
                              >
                                <span>⏳ Пополнение ожидает одобрения</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleOpenTopUpModal(dep)}
                                className="flex-1 min-w-[110px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2 px-3 text-xs font-semibold transition shadow-sm flex items-center justify-center gap-1"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>+ Пополнить</span>
                              </button>
                            )
                          ) : (
                            <button
                              disabled
                              className="flex-1 min-w-[140px] bg-slate-800/50 text-slate-500 border border-slate-800 rounded-lg py-2 px-3 text-xs font-semibold cursor-not-allowed flex items-center justify-center gap-1"
                            >
                              <span>Пополнение недоступно</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleRequestWithdrawal(dep.id)}
                            className="flex-1 min-w-[120px] bg-rose-950/30 hover:bg-rose-950/60 text-rose-400 border border-rose-900/30 rounded-lg py-2 px-3 text-xs font-semibold transition flex items-center justify-center gap-1"
                          >
                            <span>Запросить Закрытие</span>
                          </button>
                        </>
                      )}
                    </div>

                    {dep.status === 'active' && !(dep.bank_is_active !== false && (dep.allow_top_up === true || dep.allow_top_up === 1)) && (
                      <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/60 text-[10px] text-slate-400 leading-relaxed flex items-start gap-1.5">
                        <Info className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>Этот банк не разрешает самостоятельные пополнения.</strong><br />
                          Можно открыть отдельный вклад или попросить взрослого добавить поощрение.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* History of Operations */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <span>⏳</span>
            <span>История Заявок</span>
          </h2>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4 max-h-[500px] overflow-y-auto">
            {stats.recent_operations.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Здесь будут отображаться ваши финансовые заявки.</p>
            ) : (
              <div className="space-y-3">
                {stats.recent_operations.map(op => {
                  const isTopUp = op.type === 'top_up';
                  const isOpen = op.type === 'open';
                  const isWithdraw = op.type === 'withdraw';
                  const isPenalty = op.type === 'penalty';
                  const isParentReward = op.type === 'parent_reward';

                  const typeTitle = isTopUp ? '💰 Пополнение вклада' :
                                    isOpen ? '📥 Открытие вклада' :
                                    isWithdraw ? '📤 Вывод средств' :
                                    isPenalty ? '⚠️ Штраф' :
                                    isParentReward ? '🎁 Поощрение взрослого' : op.type;

                  const targetName = op.deposit_goal_title || (op.deposit_id ? `Вклад #${op.deposit_id}` : '');
                  const subtitle = targetName ? `${targetName} — ${op.bank_name}` : op.bank_name;

                  let statusText = '';
                  let statusColor = '';
                  if (op.status === 'pending') {
                    statusText = 'Ожидает одобрения взрослого';
                    statusColor = 'text-amber-400';
                  } else if (op.status === 'approved' || op.status === 'system_completed') {
                    statusText = 'Одобрено взрослым';
                    statusColor = 'text-emerald-400';
                  } else if (op.status === 'rejected') {
                    statusText = 'Отклонено взрослым';
                    statusColor = 'text-rose-400';
                  }

                  return (
                    <div key={op.id} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-slate-200 block">{typeTitle}</span>
                          <span className="text-[11px] text-slate-400 block font-medium">{subtitle}</span>
                          <p className="text-[10px] text-slate-500 font-mono">{new Date(op.requested_at).toLocaleDateString('ru-RU')}</p>
                        </div>

                        <div className="text-right space-y-0.5">
                          <span className={`text-xs font-bold font-mono block ${isPenalty ? 'text-rose-400' : 'text-slate-100'}`}>
                            {isPenalty ? '-' : '+'}{formatKopecks(op.amount_kopecks)}
                          </span>
                          <span className={`text-[10px] font-medium block ${statusColor}`}>
                            {statusText}
                          </span>
                        </div>
                      </div>

                      {op.status === 'rejected' && (op.notes || op.rejection_reason) && (
                        <div className="bg-rose-950/30 p-2 rounded-lg border border-rose-900/40 text-[10px] text-rose-300">
                          <strong>Причина:</strong> {op.notes || op.rejection_reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      </div>

      {/* Interactive Calculator Modal */}
      {showCalculatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>🧮</span>
                <span>Учебный Калькулятор & Симулятор Накоплений</span>
              </h3>
              <button
                onClick={() => setShowCalculatorModal(false)}
                className="text-slate-400 hover:text-slate-100 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Panel: Inputs */}
              <div className="lg:col-span-5 space-y-5 border-r border-slate-800 lg:pr-8">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Выберите банк для симуляции:</label>
                  <div className="space-y-1.5">
                    {activeBanks.map(b => (
                      <label
                        key={b.id}
                        className={`relative border rounded-xl p-3 cursor-pointer flex items-center justify-between transition hover:bg-slate-950 ${
                          calculatorForm.bankId === b.id.toString() ? 'border-indigo-500 bg-slate-950/80 ring-1 ring-indigo-500' : 'border-slate-800 bg-slate-950/30'
                        }`}
                      >
                        <input
                          type="radio"
                          name="bankId"
                          value={b.id}
                          checked={calculatorForm.bankId === b.id.toString()}
                          onChange={handleCalculatorChange}
                          className="sr-only"
                        />
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color || '#6366f1' }}></div>
                          <div>
                            <span className="text-xs font-bold text-slate-200 block">{b.name}</span>
                            <span className="text-[10px] text-slate-500">Ставка: {(b.interest_rate_bps / 100).toFixed(1)}% | Период: {b.period_days} дн.</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="calc-amount" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Начальный вклад (₽):</label>
                    <input
                      id="calc-amount"
                      type="number"
                      name="amountRubles"
                      step="1"
                      min="1"
                      value={calculatorForm.amountRubles}
                      onChange={handleCalculatorChange}
                      placeholder="2000"
                      required
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="calc-regular" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Пополнение (₽/пер):</label>
                    <input
                      id="calc-regular"
                      type="number"
                      name="regularTopUpRubles"
                      step="1"
                      min="0"
                      value={calculatorForm.regularTopUpRubles}
                      onChange={handleCalculatorChange}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="calc-goal" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Желаемая Цель (₽, опционально):</label>
                  <input
                    id="calc-goal"
                    type="number"
                    name="goalTargetRubles"
                    step="1"
                    min="0"
                    value={calculatorForm.goalTargetRubles}
                    onChange={handleCalculatorChange}
                    placeholder="Например, 10000"
                    className="w-full bg-slate-950 border border-slate-800 text-indigo-300 rounded-xl px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-400 uppercase tracking-wider">Количество периодов:</span>
                    <strong className="text-indigo-400 font-mono text-sm">{calculatorForm.periods}</strong>
                  </div>
                  <input
                    type="range"
                    name="periods"
                    min="1"
                    max="60"
                    value={calculatorForm.periods}
                    onChange={handleCalculatorChange}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>1 пер</span>
                    <span>12 пер</span>
                    <span>36 пер</span>
                    <span>60 пер</span>
                  </div>
                </div>

                <div className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-xl flex gap-2 text-xs text-slate-400">
                  <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed font-sans text-[11px]">
                    Симулятор поддерживает <strong>регулярные пополнения</strong> за каждый период. График и расчеты наглядно демонстрируют силу сложного процента и капитализации!
                  </p>
                </div>
              </div>

              {/* Right Panel: Results & Graph */}
              <div className="lg:col-span-7 space-y-5">
                
                {calculatorLoading && !calculatorResult ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-2"></div>
                    <p className="text-xs font-mono">Симуляция сложного процента...</p>
                  </div>
                ) : calculatorError ? (
                  <div className="bg-red-950/30 border border-red-800/40 p-4 rounded-xl text-red-300 text-xs text-center py-10">
                    <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                    <span>{calculatorError}</span>
                  </div>
                ) : calculatorResult ? (
                  <div className="space-y-5">
                    
                    {/* Top Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[9px] text-slate-500 uppercase font-medium">Будет на счёте</span>
                        <strong className="text-base font-bold text-slate-100 block font-mono">
                          {formatKopecks(calculatorResult.summary.finalBalanceKopecks)}
                        </strong>
                      </div>
                      <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-900/20 space-y-1">
                        <span className="text-[9px] text-emerald-500 uppercase font-medium">Доход от %</span>
                        <strong className="text-base font-bold text-emerald-400 block font-mono">
                          +{formatKopecks(calculatorResult.summary.totalInterestKopecks)}
                        </strong>
                      </div>
                      <div className="col-span-2 sm:col-span-1 bg-indigo-950/20 p-3 rounded-xl border border-indigo-900/20 space-y-1">
                        <span className="text-[9px] text-indigo-400 uppercase font-medium">Ваши взносы</span>
                        <strong className="text-base font-bold text-indigo-300 block font-mono">
                          {formatKopecks(calculatorResult.summary.totalInvestedKopecks)}
                        </strong>
                      </div>
                    </div>

                    {/* Goal achievement alert */}
                    {calculatorForm.goalTargetRubles && parseFloat(calculatorForm.goalTargetRubles) > 0 && (
                      <div className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                        calculatorResult.goal?.isReached 
                          ? 'bg-emerald-950/15 border-emerald-800/30 text-emerald-300' 
                          : 'bg-amber-950/15 border-amber-800/30 text-amber-300'
                      }`}>
                        <Target className={`h-4 h-4 shrink-0 mt-0.5 ${calculatorResult.goal?.isReached ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <div>
                          {calculatorResult.goal?.isReached ? (
                            <p className="font-medium">
                              🎉 <strong>Цель будет успешно достигнута!</strong> На периоде <span className="font-mono font-bold">#{calculatorResult.goal.reachedPeriod}</span> ({new Date(calculatorResult.goal.reachedDate).toLocaleDateString()}). Итоговый профицит: {formatKopecks(calculatorResult.goal.surplusKopecks)}.
                            </p>
                          ) : (
                            <p className="font-medium">
                              ⏳ <strong>Цель пока не достигнута.</strong> За {calculatorForm.periods} периодов накопится только {formatKopecks(calculatorResult.summary.finalBalanceKopecks)}. До цели не хватает {formatKopecks(calculatorResult.goal?.remainingKopecks || 0)}. Попробуйте увеличить срок вклада или сумму пополнения!
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Chart */}
                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <h4 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">График капитализации:</h4>
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={[
                              { name: 'Старт', value: parseFloat((calculatorResult.principalKopecks / 100).toFixed(2)) },
                              ...calculatorResult.forecast.map(item => ({
                                name: `${item.futurePeriod} П`,
                                value: parseFloat((item.balanceKopecks / 100).toFixed(2))
                              }))
                            ]}
                            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="colorSimBalance" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                            <YAxis stroke="#475569" fontSize={9} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f1f5f9', fontSize: '11px' }}
                              formatter={(value) => [`${value.toLocaleString()} ₽`, 'Баланс']}
                            />
                            {calculatorForm.goalTargetRubles && parseFloat(calculatorForm.goalTargetRubles) > 0 && (
                              <ReferenceLine y={parseFloat(calculatorForm.goalTargetRubles)} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Цель', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                            )}
                            <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.2} fillOpacity={1} fill="url(#colorSimBalance)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Таблица начислений:</h4>
                      <div className="max-h-[160px] overflow-y-auto rounded border border-slate-800/50">
                        <table className="w-full text-left border-collapse text-[10px] font-mono">
                          <thead className="sticky top-0 bg-slate-950 z-10">
                            <tr className="border-b border-slate-800 text-slate-500 uppercase text-[9px]">
                              <th className="py-1.5 px-2">Период</th>
                              <th className="py-1.5 px-2">Взнос/Пополнение</th>
                              <th className="py-1.5 px-2 text-right">Начислено %</th>
                              <th className="py-1.5 px-2 text-right">Баланс вклада</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900 text-slate-300">
                            <tr className="text-slate-500">
                              <td className="py-1.5 px-2">Старт</td>
                              <td className="py-1.5 px-2">{formatKopecks(calculatorResult.principalKopecks)}</td>
                              <td className="py-1.5 px-2 text-right">0.00 ₽</td>
                              <td className="py-1.5 px-2 text-right font-bold">{formatKopecks(calculatorResult.principalKopecks)}</td>
                            </tr>
                            {calculatorResult.forecast.map((item) => (
                              <tr key={item.futurePeriod} className={item.futurePeriod === parseInt(calculatorForm.periods, 10) ? "bg-indigo-950/30 text-indigo-300 font-bold" : ""}>
                                <td className="py-1.5 px-2">Период {item.futurePeriod}</td>
                                <td className="py-1.5 px-2 text-emerald-500/80">+{formatKopecks(item.contributionKopecks || 0)}</td>
                                <td className="py-1.5 px-2 text-right text-emerald-400">+{formatKopecks(item.periodInterestKopecks)}</td>
                                <td className="py-1.5 px-2 text-right font-bold">{formatKopecks(item.balanceKopecks)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-20">Укажите корректную сумму для вывода симуляции.</p>
                )}

              </div>

            </div>

            <div className="flex gap-3 justify-end border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setShowCalculatorModal(false)}
                className="bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-lg px-4 py-2 text-xs font-semibold border border-slate-800 transition"
              >
                Закрыть
              </button>
              {calculatorResult && (
                <button
                  onClick={handleTryToSave}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-xs font-semibold transition shadow-lg shadow-indigo-600/20"
                >
                  🚀 Отправить Заявку
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Deposit Modal */}
      {showNewDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>🏦</span>
                <span>Открыть Новый Вклад</span>
              </h3>
              <button
                onClick={() => setShowNewDepositModal(false)}
                className="text-slate-400 hover:text-slate-100 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateDeposit} className="space-y-5">
              
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Выберите Семейный Банк:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeBanks.map(b => (
                    <label
                      key={b.id}
                      className={`relative border rounded-xl p-3 cursor-pointer flex flex-col justify-between transition hover:bg-slate-950 ${
                        newDepositForm.bankId === b.id.toString() ? 'border-indigo-500 bg-slate-950/80 ring-1 ring-indigo-500' : 'border-slate-800 bg-slate-950/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="bankId"
                        value={b.id}
                        checked={newDepositForm.bankId === b.id.toString()}
                        onChange={handleChange}
                        className="sr-only"
                      />
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color || '#6366f1' }}></div>
                          <span className="text-sm font-bold text-slate-200">{b.name}</span>
                        </div>
                        <ul className="text-[10px] text-slate-500 space-y-0.5 font-sans">
                          <li>Ставка: <strong className="text-slate-300">{(b.interest_rate_bps / 100).toFixed(1)}%</strong></li>
                          <li>Период начисления: <strong className="text-slate-300">{b.period_days} дн.</strong></li>
                          <li>Мин. сумма: <strong className="text-slate-300">{formatKopecks(b.minimum_deposit_kopecks)}</strong></li>
                          <li>Пополнение: <strong className={b.allow_top_up ? "text-emerald-400" : "text-slate-500"}>{b.allow_top_up ? "Разрешено" : "Запрещено"}</strong></li>
                          <li>Режим: <strong className="text-indigo-400">{(b.interest_accrual_mode === 'per_contribution_period' ? 'Реалистичный' : 'Простой')}</strong></li>
                        </ul>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="amountRubles" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Сумма вклада (₽):</label>
                <input
                  id="amountRubles"
                  type="number"
                  name="amountRubles"
                  step="0.01"
                  value={newDepositForm.amountRubles}
                  onChange={handleChange}
                  placeholder="0.00"
                  required
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-3 text-lg font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                />
              </div>

              {/* Goal Setting inside New Deposit Modal */}
              <div className="border-t border-slate-800 pt-4 space-y-3.5">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-indigo-400" />
                  <span>Поставить цель для вклада (опционально)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase">Название цели:</label>
                    <input
                      type="text"
                      name="goalTitle"
                      value={newDepositForm.goalTitle}
                      onChange={handleChange}
                      placeholder="Например, Новый Ноутбук"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase">Сколько нужно накопить (₽):</label>
                    <input
                      type="number"
                      name="goalTargetRubles"
                      value={newDepositForm.goalTargetRubles}
                      onChange={handleChange}
                      placeholder="Сумма цели"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 outline-none font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase">Иконка цели:</label>
                    <select
                      name="goalIcon"
                      value={newDepositForm.goalIcon}
                      onChange={handleChange}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 outline-none"
                    >
                      <option value="🎯">🎯 Цель</option>
                      <option value="💻">💻 Техника</option>
                      <option value="🚲">🚲 Велосипед/Спорт</option>
                      <option value="🎮">🎮 Игры</option>
                      <option value="🎁">🎁 Подарок</option>
                      <option value="✈️">✈️ Путешествие</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase">Желаемая дата достижения:</label>
                    <input
                      type="date"
                      name="goalDueDate"
                      value={newDepositForm.goalDueDate}
                      onChange={handleChange}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewDepositModal(false)}
                  className="bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-lg px-4 py-2 text-xs font-semibold border border-slate-800 transition"
                >
                  Отмена
                </button>
                <button
                  id="btn-confirm-deposit"
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-xs font-semibold transition shadow-lg shadow-indigo-600/20"
                >
                  Создать Заявку
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Details Modal */}
      {selectedDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span>🏦</span>
                  <span>Параметры и Аналитика Вклада #{selectedDeposit.id}</span>
                </h3>
                {selectedDeposit.status === 'active' && (
                  (selectedDeposit.bank_is_active !== false && (selectedDeposit.allow_top_up === true || selectedDeposit.allow_top_up === 1)) ? (
                    selectedDeposit.has_pending_top_up ? (
                      <span className="text-[11px] font-semibold bg-amber-950/50 text-amber-300 border border-amber-800/50 px-2.5 py-1 rounded-lg">
                        ⏳ Пополнение ожидает одобрения
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          const depToTopUp = selectedDeposit;
                          setSelectedDeposit(null);
                          handleOpenTopUpModal(depToTopUp);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-2.5 py-1 text-xs font-semibold transition shadow-sm flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>+ Пополнить этот вклад</span>
                      </button>
                    )
                  ) : (
                    <span className="text-[11px] text-slate-500 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                      Пополнение недоступно
                    </span>
                  )
                )}
              </div>
              <button
                onClick={() => setSelectedDeposit(null)}
                className="text-slate-400 hover:text-slate-100 text-2xl font-semibold focus:outline-none"
              >
                &times;
              </button>
            </div>

            <div className="flex border-b border-slate-800 overflow-x-auto whitespace-nowrap">
              <button
                type="button"
                onClick={() => setDetailsTab('forecast')}
                className={`flex-1 py-2 px-3 text-center text-xs font-bold border-b-2 transition ${
                  detailsTab === 'forecast' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                📈 Прогноз роста (12 периодов)
              </button>
              {selectedDeposit.status === 'active' && selectedDeposit.allow_top_up === 1 && (
                <button
                  type="button"
                  onClick={() => setDetailsTab('topup')}
                  className={`flex-1 py-2 px-3 text-center text-xs font-bold border-b-2 transition ${
                    detailsTab === 'topup' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ➕ Пополнить вклад
                </button>
              )}
              {selectedDeposit.status === 'active' && (
                <button
                  type="button"
                  onClick={() => setDetailsTab('goal')}
                  className={`flex-1 py-2 px-3 text-center text-xs font-bold border-b-2 transition ${
                    detailsTab === 'goal' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🎯 Моя цель
                </button>
              )}
              {(selectedDeposit.status === 'active' || selectedDeposit.status === 'pending_close') && (
                <button
                  type="button"
                  onClick={() => setDetailsTab('withdrawal')}
                  className={`flex-1 py-2 px-3 text-center text-xs font-bold border-b-2 transition ${
                    detailsTab === 'withdrawal' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⚠️ Расчет закрытия & штрафы
                </button>
              )}
            </div>

            {/* Error alerts inside Details Modal */}
            {topUpError && (
              <div className="bg-red-950/40 border border-red-800 text-red-300 text-xs p-3.5 rounded-xl flex items-start gap-2 animate-shake">
                <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5 text-red-400" />
                <span>{topUpError}</span>
              </div>
            )}
            {topUpSuccess && (
              <div className="bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs p-3.5 rounded-xl">
                {topUpSuccess}
              </div>
            )}

            {!detailedDepositData ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
                <p className="text-xs text-slate-500 mt-2 font-mono">Загрузка параметров и истории вклада...</p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* TAB 1: GROW GROWTH FORECAST */}
                {detailsTab === 'forecast' && (
                  <div className="space-y-6">
                    {(() => {
                      const topUpsSum = (detailedDepositData.contributions || [])
                        .filter(c => c.type === 'top_up' && c.status === 'approved')
                        .reduce((sum, c) => sum + c.amount_kopecks, 0);
                        
                      const parentRewardsSum = (detailedDepositData.contributions || [])
                        .filter(c => c.type === 'parent_reward' && c.status === 'approved')
                        .reduce((sum, c) => sum + c.amount_kopecks, 0);
                        
                      const totalContributed = detailedDepositData.principal_kopecks + topUpsSum + parentRewardsSum;
                      
                      return (
                        <div className="bg-slate-950 border border-slate-800/60 rounded-2xl p-5 space-y-4">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Финансовая структура вклада:</h4>
                          
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono">
                            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800/60 space-y-1">
                              <span className="text-slate-500 block text-[11px]">Первоначальный взнос:</span>
                              <strong className="text-slate-200 text-sm block font-bold">{formatKopecks(detailedDepositData.principal_kopecks)}</strong>
                            </div>
                            
                            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800/60 space-y-1">
                              <span className="text-slate-500 block text-[11px]">Самостоятельные пополнения:</span>
                              <strong className="text-indigo-400 text-sm block font-bold">{formatKopecks(topUpsSum)}</strong>
                            </div>
                            
                            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800/60 space-y-1">
                              <span className="text-slate-500 block text-[11px]">Поощрения взрослых:</span>
                              <strong className="text-emerald-400 text-sm block font-bold">{formatKopecks(parentRewardsSum)}</strong>
                            </div>

                            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/30 space-y-1">
                              <span className="text-slate-500 block text-[11px]">Внесено всего:</span>
                              <strong className="text-slate-100 text-sm block font-bold">{formatKopecks(totalContributed)}</strong>
                            </div>

                            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/30 space-y-1">
                              <span className="text-slate-500 block text-[11px]">Начисленные проценты:</span>
                              <strong className="text-amber-400 text-sm block font-bold">+{formatKopecks(detailedDepositData.earned_interest_kopecks)}</strong>
                            </div>

                            <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/20 space-y-1 ring-1 ring-indigo-500/10">
                              <span className="text-indigo-400 block text-[11px]">Текущий баланс:</span>
                              <strong className="text-indigo-300 text-sm block font-bold">{formatKopecks(detailedDepositData.calculated_balance_kopecks)}</strong>
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-900 pt-3">
                            <span>Условия банка: <strong>{(detailedDepositData.locked_interest_rate_bps/100).toFixed(1)}% / {detailedDepositData.locked_period_days} дн.</strong></span>
                            <span>Режим начисления: <strong className="text-indigo-400">{detailedDepositData.locked_interest_accrual_mode === 'per_contribution_period' ? 'Реалистичный' : 'Простой'}</strong></span>
                          </div>
                        </div>
                      );
                    })()}

                    {detailedDepositData.analytics && (
                      <div className="space-y-6">
                        {/* Dynamic Chart */}
                        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Интерактивный график капитализации вклада:</h4>
                          <div className="h-[180px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={[
                                  { name: 'Сейчас', value: parseFloat((detailedDepositData.analytics.current.balanceKopecks / 100).toFixed(2)) },
                                  ...detailedDepositData.analytics.forecast.map(item => ({
                                    name: `П-${item.futurePeriod}`,
                                    value: parseFloat((item.balanceKopecks / 100).toFixed(2))
                                  }))
                                ]}
                                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                              >
                                <defs>
                                  <linearGradient id="colorForecastBalance" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                                <YAxis stroke="#475569" fontSize={9} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f1f5f9', fontSize: '11px' }}
                                  formatter={(value) => [`${value.toLocaleString()} ₽`, 'Ожидаемый баланс']}
                                />
                                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorForecastBalance)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* List of contributions */}
                        {detailedDepositData.contributions && detailedDepositData.contributions.length > 0 && (
                          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-2">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">История взносов и пополнений:</h4>
                            <div className="space-y-2 max-h-[140px] overflow-y-auto">
                              {detailedDepositData.contributions.map(c => (
                                <div key={c.id} className="bg-slate-950 p-2.5 rounded-lg border border-slate-900 flex justify-between items-center text-xs font-mono">
                                  <div>
                                    <span className="font-bold text-slate-200 block">
                                      {c.type === 'initial' ? '📥 Начальный вклад' : 
                                       c.type === 'parent_reward' ? '🎁 Поощрение взрослого' : 
                                       '💰 Самостоятельное пополнение'}
                                    </span>
                                    <span className="text-[10px] text-slate-500 block">
                                      {c.status === 'approved' 
                                        ? `Дата одобрения: ${new Date(c.approved_at || c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}` 
                                        : `Создан: ${new Date(c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className="font-bold text-indigo-400 block">+{formatKopecks(c.amount_kopecks)}</span>
                                    <span className={`text-[10px] block font-medium ${
                                      c.status === 'approved' ? 'text-emerald-400' :
                                      c.status === 'pending' ? 'text-amber-400' : 'text-rose-400'
                                    }`}>
                                      {c.status === 'approved' ? 'Одобрен' : c.status === 'pending' ? 'Ожидает родителей' : 'Отклонен'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Ledger Table */}
                        <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Прогноз начислений сложного процента (на 12 периодов):</h4>
                          <div className="max-h-[160px] overflow-y-auto rounded border border-slate-800/50">
                            <table className="w-full text-left border-collapse text-[10px] font-mono">
                              <thead className="sticky top-0 bg-slate-950 z-10">
                                <tr className="border-b border-slate-800 text-slate-500 uppercase text-[9px]">
                                  <th className="py-1.5 px-2">Будущий период</th>
                                  <th className="py-1.5 px-2">Дата начисления</th>
                                  <th className="py-1.5 px-2 text-right">Начислено</th>
                                  <th className="py-1.5 px-2 text-right">Ожидаемый баланс</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-900 text-slate-300">
                                <tr className="text-slate-500">
                                  <td className="py-1.5 px-2">Сейчас</td>
                                  <td className="py-1.5 px-2">-</td>
                                  <td className="py-1.5 px-2 text-right">0.00 ₽</td>
                                  <td className="py-1.5 px-2 text-right font-bold">{formatKopecks(detailedDepositData.analytics.current.balanceKopecks)}</td>
                                </tr>
                                {detailedDepositData.analytics.forecast.map((item) => (
                                  <tr key={item.futurePeriod} className={item.futurePeriod === 12 ? "bg-indigo-950/30 text-indigo-300 font-bold" : ""}>
                                    <td className="py-1.5 px-2">Период {item.futurePeriod}</td>
                                    <td className="py-1.5 px-2">{new Date(item.date).toLocaleDateString()}</td>
                                    <td className="py-1.5 px-2 text-right text-emerald-400">+{formatKopecks(item.periodInterestKopecks)}</td>
                                    <td className="py-1.5 px-2 text-right font-bold">{formatKopecks(item.balanceKopecks)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: REQUEST TOP UP */}
                {detailsTab === 'topup' && (
                  <div className="bg-slate-950/50 p-5 rounded-2xl border border-slate-800 space-y-5">
                    <div className="space-y-1.5">
                      <h4 className="text-sm font-bold text-slate-200">Пополнение открытого вклада</h4>
                      <p className="text-xs text-slate-400">
                        В банке <strong>{detailedDepositData.bank_name}</strong> разрешено пополнение. Все новые пополнения будут направлены взрослому на одобрение и начнут приносить прибыль согласно режиму начисления!
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-900">
                      <div>
                        <span className="text-slate-500">Минимум для пополнения:</span>
                        <strong className="text-slate-300 block">{formatKopecks(detailedDepositData.minimum_top_up_kopecks || 0)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Максимум за раз:</span>
                        <strong className="text-slate-300 block">{formatKopecks(detailedDepositData.maximum_top_up_kopecks || 0)}</strong>
                      </div>
                    </div>

                    <form onSubmit={handleRequestTopUpSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-400 uppercase">Сумма пополнения (₽):</label>
                        <input
                          type="number"
                          step="0.01"
                          value={topUpAmountRubles}
                          onChange={(e) => setTopUpAmountRubles(e.target.value)}
                          placeholder="0.00"
                          required
                          className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-base font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                        />
                      </div>
                      <button
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl px-4 py-2.5 text-xs transition w-full shadow-lg shadow-indigo-600/10"
                      >
                        Отправить запрос на пополнение
                      </button>
                    </form>
                  </div>
                )}

                {/* TAB 3: DEPOSIT GOAL MANAGER */}
                {detailsTab === 'goal' && (
                  <div className="space-y-5">
                    {!detailedDepositData.goal_title && !editingGoal ? (
                      <div className="text-center py-8 space-y-3.5 bg-slate-950/40 border border-slate-800 rounded-xl">
                        <Target className="h-10 w-10 text-slate-600 mx-auto" />
                        <div>
                          <h4 className="text-sm font-bold text-slate-300">Цель накопления не установлена</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Установка конкретной финансовой цели мотивирует копить быстрее и бережнее!</p>
                        </div>
                        <button
                          onClick={() => setEditingGoal(true)}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-xs font-semibold transition"
                        >
                          Установить цель
                        </button>
                      </div>
                    ) : editingGoal ? (
                      <form onSubmit={handleSaveGoal} className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-4">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Параметры цели накопления:</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase">Название цели:</label>
                            <input
                              type="text"
                              value={goalForm.title}
                              onChange={(e) => setGoalForm(prev => ({ ...prev, title: e.target.value }))}
                              placeholder="Новый смартфон, скейтборд..."
                              required
                              className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase">Сколько нужно собрать (₽):</label>
                            <input
                              type="number"
                              value={goalForm.targetRubles}
                              onChange={(e) => setGoalForm(prev => ({ ...prev, targetRubles: e.target.value }))}
                              placeholder="10000"
                              required
                              className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 outline-none font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase">Иконка цели:</label>
                            <select
                              value={goalForm.icon}
                              onChange={(e) => setGoalForm(prev => ({ ...prev, icon: e.target.value }))}
                              className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 outline-none"
                            >
                              <option value="🎯">🎯 Цель</option>
                              <option value="💻">💻 Техника</option>
                              <option value="🚲">🚲 Спорт / Актив</option>
                              <option value="🎮">🎮 Игры / Хобби</option>
                              <option value="✈️">✈️ Поездка</option>
                              <option value="🎁">🎁 Сюрприз</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase">Срок (желаемая дата):</label>
                            <input
                              type="date"
                              value={goalForm.dueDate}
                              onChange={(e) => setGoalForm(prev => ({ ...prev, dueDate: e.target.value }))}
                              className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3 py-2 text-xs focus:border-indigo-500 outline-none font-mono"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase">Заметка / Описание цели:</label>
                          <textarea
                            value={goalForm.note}
                            onChange={(e) => setGoalForm(prev => ({ ...prev, note: e.target.value }))}
                            placeholder="Коплю на классный девайс!"
                            className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2.5 text-xs focus:border-indigo-500 outline-none h-16 resize-none"
                          />
                        </div>

                        <div className="flex justify-end gap-2.5 pt-2">
                          <button
                            type="button"
                            onClick={() => setEditingGoal(false)}
                            className="bg-slate-900 border border-slate-800 text-slate-400 rounded-lg px-3.5 py-1.5 text-xs transition"
                          >
                            Отмена
                          </button>
                          <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-1.5 text-xs transition font-semibold"
                          >
                            Сохранить изменения
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="bg-slate-950/60 border border-slate-800 p-5 rounded-2xl space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2.5">
                            <span className="text-3xl">{detailedDepositData.goal?.icon || '🎯'}</span>
                            <div>
                              <h4 className="text-base font-bold text-slate-200">{detailedDepositData.goal?.title}</h4>
                              {detailedDepositData.goal?.dueDate && (
                                <span className="text-xs text-slate-500 font-mono">Срок накопления: {new Date(detailedDepositData.goal.dueDate).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setEditingGoal(true)}
                              className="bg-slate-900 border border-slate-800 hover:text-indigo-400 text-slate-400 p-1.5 rounded-lg transition"
                              title="Редактировать цель"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={handleDeleteGoal}
                              className="bg-slate-900 border border-slate-800 hover:text-rose-400 text-slate-400 p-1.5 rounded-lg transition"
                              title="Удалить цель"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {detailedDepositData.goal?.note && (
                          <p className="text-xs text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-900 italic leading-relaxed">
                            "{detailedDepositData.goal.note}"
                          </p>
                        )}

                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs font-mono">
                            <span className="text-slate-500">Накоплено: {formatKopecks(detailedDepositData.calculated_balance_kopecks)}</span>
                            <span className="text-indigo-400 font-bold">Цель: {formatKopecks(detailedDepositData.goal?.targetKopecks)}</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-2 rounded-full transition-all duration-500" 
                              style={{ width: `${Math.min(100, detailedDepositData.goal?.progressPercent || 0)}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span>Осталось до цели: <strong>{formatKopecks(detailedDepositData.goal?.remainingKopecks)}</strong></span>
                            <span className="text-emerald-400">Прогресс: <strong>{detailedDepositData.goal?.progressPercent}%</strong></span>
                          </div>
                        </div>

                        {/* Forecast to reach goal */}
                        {detailedDepositData.goal?.estimatedPeriodsWithoutTopUps !== null && (
                          <div className="bg-indigo-950/15 border border-indigo-900/35 p-4 rounded-xl text-xs space-y-1 text-slate-300">
                            <p className="font-semibold text-indigo-300 flex items-center gap-1.5">
                              <Clock className="h-4 w-4" />
                              <span>Когда цель будет достигнута (без пополнений)?</span>
                            </p>
                            <p className="leading-relaxed text-slate-400">
                              По формуле сложного процента, цель будет полностью закрыта через <strong>{detailedDepositData.goal.estimatedPeriodsWithoutTopUps} пер.</strong> (приблизительно к <strong>{new Date(detailedDepositData.goal.estimatedDateWithoutTopUps).toLocaleDateString()}</strong>).
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: EARLY WITHDRAWAL CALCULATION */}
                {detailsTab === 'withdrawal' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="details-withdrawal-date" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Планируемая дата снятия:</label>
                        <input
                          id="details-withdrawal-date"
                          type="date"
                          value={withdrawalDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => handleWithdrawalDateChange(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2 text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                        />
                      </div>
                      <div className="flex flex-col justify-end">
                        <span className="text-[10px] text-slate-500 italic block leading-relaxed">
                          💡 По умолчанию выбрана текущая дата. Вы можете указать дату в будущем, чтобы увидеть, как снижается или полностью исчезает штраф по мере приближения к минимальному сроку вклада.
                        </span>
                      </div>
                    </div>

                    {withdrawalLoading && !withdrawalData ? (
                      <div className="text-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
                        <p className="text-[11px] text-slate-500 mt-2 font-mono">Пересчет условий и штрафов...</p>
                      </div>
                    ) : withdrawalData ? (
                      <div className="space-y-6">
                        
                        {/* Dynamic Warning (ONLY show if penalty or forfeited interest > 0) */}
                        {withdrawalData.withdrawal.isEarly && (withdrawalData.withdrawal.penaltyKopecks > 0 || withdrawalData.withdrawal.interestForfeitedKopecks > 0) ? (
                          <div className="bg-rose-950/20 border border-rose-800/40 p-4 rounded-xl flex gap-3">
                            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <h4 className="text-xs font-bold text-rose-300">Внимание: Действует штраф за раннее снятие!</h4>
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                Вклад удерживается всего <strong>{withdrawalData.withdrawal.daysHeld} дн.</strong> из минимально обязательных <strong>{withdrawalData.withdrawal.minimumHoldingDays} дн.</strong> 
                                {withdrawalData.withdrawal.interestForfeitedKopecks > 0 && " Все накопленные проценты будут аннулированы!"}
                                Штраф банка составит <strong>{formatKopecks(withdrawalData.withdrawal.penaltyKopecks)}</strong>. 
                                Чтобы получить средства без штрафов, подождите еще <strong>{withdrawalData.withdrawal.daysUntilPenaltyFree} дн.</strong> (до {new Date(withdrawalData.comparison.nextPenaltyFreeDate).toLocaleDateString()}).
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-emerald-950/20 border border-emerald-800/30 p-4 rounded-xl flex gap-3">
                            <Check className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <h4 className="text-xs font-bold text-emerald-300">Штрафы отсутствуют</h4>
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                Минимальный срок удержания вклада (<strong>{withdrawalData.withdrawal.minimumHoldingDays} дн.</strong>) пройден! Досрочный штраф и аннулирование процентов не применяются. Вы получите полную накопленную сумму!
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Breakdown Metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-xs font-mono">
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[9px] text-slate-500 uppercase">Баланс вклада</span>
                            <strong className="text-slate-200 text-xs block font-bold">
                              {formatKopecks(withdrawalData.withdrawal.currentBalanceBeforeAdjustmentKopecks)}
                            </strong>
                          </div>
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[9px] text-rose-400 uppercase">Прямой штраф</span>
                            <strong className="text-rose-400 text-xs block font-bold">
                              -{formatKopecks(withdrawalData.withdrawal.penaltyKopecks)}
                            </strong>
                          </div>
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[9px] text-rose-400 uppercase">Аннулировано %</span>
                            <strong className="text-rose-400 text-xs block font-bold">
                              -{formatKopecks(withdrawalData.withdrawal.interestForfeitedKopecks)}
                            </strong>
                          </div>
                          <div className="bg-indigo-950/20 p-3 rounded-xl border border-indigo-900/40 space-y-1">
                            <span className="text-[9px] text-indigo-400 uppercase">Итого к выдаче</span>
                            <strong className="text-indigo-300 text-xs block font-bold">
                              {formatKopecks(withdrawalData.withdrawal.payoutKopecks)}
                            </strong>
                          </div>
                          <div className="col-span-2 sm:col-span-1 bg-amber-950/20 p-3 rounded-xl border border-amber-900/30 space-y-1">
                            <span className="text-[9px] text-amber-500 uppercase">Упущено выгоды</span>
                            <strong className="text-amber-400 text-xs block font-bold">
                              {formatKopecks(withdrawalData.comparison.totalDifferenceKopecks)}
                            </strong>
                          </div>
                        </div>

                        {/* Timeline comparison Chart */}
                        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Наглядное сравнение упущенной выгоды (Ранний вывод vs Продолжение вклада):</h4>
                          <div className="h-[160px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={withdrawalData.timeline.map(item => ({
                                  name: item.period === 0 ? 'Сейчас' : `П-${item.period}`,
                                  'Снять сейчас': parseFloat((item.withdrawNowPayoutKopecks / 100).toFixed(2)),
                                  'Продолжить вклад': parseFloat((item.continueBalanceKopecks / 100).toFixed(2))
                                }))}
                                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="name" stroke="#475569" fontSize={9} />
                                <YAxis stroke="#475569" fontSize={9} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f1f5f9', fontSize: '11px' }}
                                />
                                <Legend verticalAlign="top" height={24} iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                                <Line type="monotone" dataKey="Снять сейчас" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Закрыть вклад сейчас" />
                                <Line type="monotone" dataKey="Продолжить вклад" stroke="#10b981" strokeWidth={2.5} dot={false} name="Продолжить и копить" />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Detail text breakdown */}
                        <div className="text-[11px] text-slate-400 bg-slate-950/30 p-4 rounded-xl border border-slate-800 space-y-1">
                          <p>
                            • Если вы закроете вклад сейчас, вы получите на руки <strong>{formatKopecks(withdrawalData.withdrawal.payoutKopecks)}</strong>.
                          </p>
                          <p>
                            • Если вы решите продолжать копить, через {withdrawalData.comparison.forecastPeriods} периодов вы заберете <strong>{formatKopecks(withdrawalData.comparison.continueToFinalBalanceKopecks)}</strong>.
                          </p>
                          <p className="text-amber-400 font-semibold">
                            • Общая разница (упущенная выгода) за этот срок составит {formatKopecks(withdrawalData.comparison.totalDifferenceKopecks)} (из которых {formatKopecks(withdrawalData.comparison.lostFutureGrowthKopecks)} — это проценты, которые вы могли бы заработать в будущем).
                          </p>
                        </div>

                      </div>
                    ) : null}
                  </div>
                )}

                <div className="flex gap-2 justify-end border-t border-slate-800 pt-4">
                  <button
                    onClick={() => setSelectedDeposit(null)}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-lg px-4 py-2 text-xs font-semibold border border-slate-800 transition"
                  >
                    Закрыть окно
                  </button>
                  {detailedDepositData.status === 'active' && (
                    <button
                      onClick={() => handleRequestWithdrawal(detailedDepositData.id)}
                      className="bg-rose-600 hover:bg-rose-500 text-white rounded-lg px-4 py-2 text-xs font-semibold transition shadow-lg shadow-rose-600/20"
                    >
                      Снять средства сейчас
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standalone Top-Up Modal */}
      {showTopUpModal && topUpDeposit && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Пополнить вклад"
          onKeyDown={(e) => { if (e.key === 'Escape') setShowTopUpModal(false); }}
          tabIndex={-1}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto my-auto relative">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>💰</span>
                <span>Пополнить вклад</span>
              </h3>
              <button
                onClick={() => setShowTopUpModal(false)}
                className="text-slate-400 hover:text-slate-100 text-2xl font-semibold focus:outline-none rounded-lg p-1 hover:bg-slate-800 transition"
                aria-label="Закрыть"
              >
                &times;
              </button>
            </div>

            {!topUpConfirmStep ? (
              /* STEP 1: Form */
              <div className="space-y-5">
                {/* Deposit Details Info */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Вклад:</span>
                    <span className="text-slate-200 font-bold">{topUpDeposit.goal_title || `Вклад #${topUpDeposit.id}`}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Банк:</span>
                    <span className="text-slate-200 font-bold">{topUpDeposit.bank_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Текущий баланс:</span>
                    <span className="text-emerald-400 font-bold">{formatKopecks(topUpDeposit.calculated_balance_kopecks)}</span>
                  </div>
                  {topUpDeposit.goal_title && topUpDeposit.goal_target_kopecks && (
                    <div className="flex justify-between items-center pt-1 border-t border-slate-900">
                      <span className="text-slate-500">Цель:</span>
                      <span className="text-indigo-400 font-bold truncate max-w-[200px]">
                        {topUpDeposit.goal_title} — {formatKopecks(topUpDeposit.calculated_balance_kopecks)} из {formatKopecks(topUpDeposit.goal_target_kopecks)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Amount Field */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Сумма пополнения:
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={topUpAmountRubles}
                      onChange={(e) => {
                        setTopUpAmountRubles(e.target.value);
                        setTopUpError('');
                      }}
                      placeholder="500"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl pl-4 pr-10 py-3 text-lg font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                      autoFocus
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">₽</span>
                  </div>

                  {topUpError && (
                    <p className="text-xs text-rose-400 font-medium bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50">
                      {topUpError}
                    </p>
                  )}

                  {/* Limits and projected sum */}
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1 text-xs font-mono text-slate-400">
                    <div className="flex justify-between">
                      <span>Минимум:</span>
                      <strong className="text-slate-200">{formatKopecks(topUpDeposit.minimum_top_up_kopecks || 10000)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Максимум за одно пополнение:</span>
                      <strong className="text-slate-200">{formatKopecks(topUpDeposit.maximum_top_up_kopecks || 200000)}</strong>
                    </div>
                    {topUpDeposit.maximum_total_deposit_per_child_kopecks && (
                      <div className="flex justify-between">
                        <span>Лимит по вкладам ребёнка:</span>
                        <strong className="text-slate-200">{formatKopecks(topUpDeposit.maximum_total_deposit_per_child_kopecks)}</strong>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-slate-800/80 text-emerald-400 font-bold">
                      <span>После одобрения будет внесено:</span>
                      <span>
                        {formatKopecks(
                          (topUpDeposit.calculated_balance_kopecks || 0) + 
                          (parseFloat(topUpAmountRubles) > 0 ? Math.round(parseFloat(topUpAmountRubles) * 100) : 0)
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Interest Explanation */}
                <div className="bg-indigo-950/30 border border-indigo-900/40 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <span>💡</span>
                    <span>Как будут расти новые деньги</span>
                  </h4>
                  { (topUpDeposit.locked_interest_accrual_mode === 'per_contribution_period' || topUpDeposit.interest_accrual_mode === 'per_contribution_period') ? (
                    <p className="text-xs text-indigo-200/90 leading-relaxed">
                      После одобрения взрослым сумма сразу появится на вкладе.<br />
                      Первые проценты на новые деньги начислятся после полного периода:<br />
                      <strong>через {topUpDeposit.locked_period_days || topUpDeposit.period_days || 14} дней</strong> после одобрения.
                    </p>
                  ) : (
                    <p className="text-xs text-indigo-200/90 leading-relaxed">
                      После одобрения взрослым сумма сразу появится на вкладе.<br />
                      В следующую общую дату начисления — <strong>{
                        topUpDeposit.next_accrual_date 
                          ? new Date(topUpDeposit.next_accrual_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
                          : 'следующую дату'
                      }</strong> — процент будет рассчитан от всей суммы вклада.
                    </p>
                  )}
                </div>

                {/* Form Action Buttons */}
                <div className="flex gap-3 justify-end pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowTopUpModal(false)}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-xl px-4 py-2.5 text-xs font-semibold border border-slate-800 transition"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTopUpError('');
                      const rubles = parseFloat(topUpAmountRubles);
                      if (isNaN(rubles) || rubles <= 0) {
                        setTopUpError('Минимальная сумма пополнения — ' + formatKopecks(topUpDeposit.minimum_top_up_kopecks || 10000));
                        return;
                      }
                      const amountKopecks = Math.round(rubles * 100);
                      const minKopecks = topUpDeposit.minimum_top_up_kopecks || 10000;
                      const maxKopecks = topUpDeposit.maximum_top_up_kopecks || 200000;
                      if (amountKopecks < minKopecks) {
                        setTopUpError(`Минимальная сумма пополнения — ${formatKopecks(minKopecks)}`);
                        return;
                      }
                      if (amountKopecks > maxKopecks) {
                        setTopUpError(`Максимальная сумма пополнения — ${formatKopecks(maxKopecks)}`);
                        return;
                      }
                      if (topUpDeposit.maximum_total_deposit_per_child_kopecks) {
                        const newTotal = (topUpDeposit.calculated_balance_kopecks || 0) + amountKopecks;
                        if (newTotal > topUpDeposit.maximum_total_deposit_per_child_kopecks) {
                          setTopUpError(`Превышен общий лимит по вкладам в этом банке. Лимит: ${formatKopecks(topUpDeposit.maximum_total_deposit_per_child_kopecks)}. Текущий баланс: ${formatKopecks(topUpDeposit.calculated_balance_kopecks)}`);
                          return;
                        }
                      }
                      setTopUpConfirmStep(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-5 py-2.5 text-xs transition shadow-lg shadow-emerald-600/20"
                  >
                    Отправить заявку
                  </button>
                </div>
              </div>
            ) : (
              /* STEP 2: Confirmation */
              <div className="space-y-5">
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-slate-100">
                    Отправить заявку на пополнение?
                  </h4>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Вклад:</span>
                      <span className="text-slate-200 font-bold">{topUpDeposit.goal_title || `Вклад #${topUpDeposit.id}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Сумма:</span>
                      <span className="text-emerald-400 font-bold">+{formatKopecks(Math.round(parseFloat(topUpAmountRubles) * 100))}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 pt-2 border-t border-slate-900 leading-relaxed">
                    Взрослый должен подтвердить пополнение.<br />
                    Деньги появятся на вкладе после одобрения.
                  </p>
                </div>

                {topUpError && (
                  <p className="text-xs text-rose-400 font-medium bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/50">
                    {topUpError}
                  </p>
                )}

                <div className="flex gap-3 justify-end pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    disabled={topUpSubmitting}
                    onClick={() => setTopUpConfirmStep(false)}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-400 rounded-xl px-4 py-2.5 text-xs font-semibold border border-slate-800 transition"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    disabled={topUpSubmitting}
                    onClick={async () => {
                      setTopUpSubmitting(true);
                      setTopUpError('');
                      try {
                        const amountKopecks = Math.round(parseFloat(topUpAmountRubles) * 100);
                        await axios.post(`/deposits/${topUpDeposit.id}/top-ups`, { amountKopecks });
                        setSuccessMessage(`Заявка на пополнение +${formatKopecks(amountKopecks)} отправлена взрослому.`);
                        setShowTopUpModal(false);
                        fetchDashboardData();
                      } catch (err) {
                        setTopUpError(err.response?.data?.error || 'Ошибка отправки заявки.');
                        setTopUpConfirmStep(false);
                      } finally {
                        setTopUpSubmitting(false);
                      }
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5 text-xs transition shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                  >
                    {topUpSubmitting && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>}
                    <span>Отправить</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

export default ChildDashboard;
