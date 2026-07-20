import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DollarSign, TrendingUp, PiggyBank, Plus, Eye, Calendar, Clock, BarChart3 } from 'lucide-react';
import './ChildDashboard.css';

const ChildDashboard = ({ user, onLogout }) => {
  const [deposits, setDeposits] = useState([]);
  const [stats, setStats] = useState({
    total_invested: 0,
    total_current: 0,
    deposits_count: 0,
    active_deposits: 0,
    total_interest_earned: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewDepositModal, setShowNewDepositModal] = useState(false);
  const [newDepositForm, setNewDepositForm] = useState({
    bank: 'mama',
    amount: ''
  });
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [bankSettings, setBankSettings] = useState({
    mama: { interest_rate: 0.035, period_days: 14, min_amount: 1000, penalty_rate: 0.0, display_name: 'Мама-банк' },
    papa: { interest_rate: 0.11, period_days: 30, min_amount: 2000, penalty_rate: 0.02, display_name: 'Папа-банк' }
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch deposits
      const depositsResponse = await axios.get(`/deposits?child_id=${user.id}`);
      setDeposits(depositsResponse.data);

      // Fetch stats
      const statsResponse = await axios.get(`/analytics/stats/${user.id}`);
      setStats(statsResponse.data);

      // Fetch dynamic settings
      const settingsResponse = await axios.get('/settings');
      setBankSettings(settingsResponse.data);
      
      const bankKeys = Object.keys(settingsResponse.data);
      if (bankKeys.length > 0) {
        setNewDepositForm(prev => ({ ...prev, bank: bankKeys[0] }));
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeposit = async (e) => {
    e.preventDefault();
    try {
      setSuccessMessage('');
      await axios.post('/deposits', {
        bank: newDepositForm.bank,
        amount: parseFloat(newDepositForm.amount)
      });
      setShowNewDepositModal(false);
      setNewDepositForm(prev => ({ ...prev, amount: '' }));
      setSuccessMessage('Запрос на открытие вклада успешно отправлен взрослым на подтверждение!');
      fetchDashboardData(); // Refresh data
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка создания вклада');
    }
  };

  const handleRequestWithdrawal = async (depositId) => {
    try {
      setSuccessMessage('');
      await axios.post('/operations/request', {
        deposit_id: depositId,
        type: 'withdraw'
      });
      setSuccessMessage('Запрос на досрочное закрытие вклада успешно отправлен на согласование!');
      fetchDashboardData(); // Refresh data
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка запроса снятия');
    }
  };

  const handleApproveRateChange = async (depositId) => {
    try {
      setError('');
      setSuccessMessage('');
      const response = await axios.post(`/deposits/${depositId}/approve-rate-change`);
      setSuccessMessage(response.data.message);
      fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка подтверждения условий');
    }
  };

  const handleDeclineRateChange = async (depositId) => {
    try {
      setError('');
      setSuccessMessage('');
      const response = await axios.post(`/deposits/${depositId}/decline-rate-change`);
      setSuccessMessage(response.data.message);
      fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка отклонения условий');
    }
  };

  const getBankColor = (bank) => {
    if (bank === 'mama') return '#FF6B6B';
    if (bank === 'papa') return '#3B82F6';
    if (bank === 'babushka') return '#10B981';
    return '#8B5CF6';
  };

  const getBankIcon = (bank) => {
    if (bank === 'mama') return '🏠';
    if (bank === 'papa') return '🏖️';
    if (bank === 'babushka') return '👵';
    return '🏦';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'closed':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  if (loading) {
    return (
      <div className="child-dashboard loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Загрузка данных...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="child-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Личный кабинет</h1>
          <div className="user-actions">
            <span>Привет, {user.name}!</span>
            <button onClick={() => setShowNewDepositModal(true)} className="new-deposit-btn">
              <Plus size={18} />
              Новый вклад
            </button>
            <button onClick={onLogout} className="logout-btn">Выйти</button>
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="success-banner" style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '12px 20px', borderRadius: '8px', margin: '15px auto', maxWidth: '1200px', fontWeight: 'bold', border: '1px solid #10B981', textAlign: 'center' }}>
          {successMessage}
        </div>
      )}

      {/* Pending Rate Changes Notifications */}
      {deposits.filter(d => d.rate_change_status === 'pending_child_approval').length > 0 && (
        <section className="rate-change-notifications" style={{ maxWidth: '1200px', margin: '20px auto', padding: '0 15px' }}>
          <div className="rate-change-card" style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)', border: '1px solid #F59E0B', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#B45309', margin: '0 0 10px 0', fontSize: '1.25rem' }}>
              📢 Новые условия по вашим вкладам!
            </h2>
            <p style={{ color: '#78350F', fontSize: '0.95rem', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              Взрослые обновили процентные ставки. Ваши ранее заработанные проценты будут зафиксированы и добавлены к телу вклада. Вы можете подтвердить переход или оставить прежние условия.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {deposits.filter(d => d.rate_change_status === 'pending_child_approval').map(deposit => {
                const interestEarned = deposit.calculated_balance - deposit.amount;
                return (
                  <div key={deposit.id} style={{ backgroundColor: 'white', borderRadius: '8px', padding: '15px', border: '1px solid #FDE68A' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                      <strong style={{ color: '#1F2937' }}>
                        Вклад #{deposit.id} в "{bankSettings[deposit.bank]?.display_name || deposit.bank}"
                      </strong>
                      <span style={{ color: '#4B5563', fontSize: '0.9rem' }}>
                        Создан {new Date(deposit.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '15px', fontSize: '0.9rem' }}>
                      <div>
                        <div style={{ color: '#6B7280' }}>Начальная сумма:</div>
                        <strong style={{ color: '#111827' }}>{deposit.amount.toLocaleString()} ₽</strong>
                      </div>
                      <div>
                        <div style={{ color: '#6B7280' }}>Накоплено процентов:</div>
                        <strong style={{ color: '#10B981' }}>+{interestEarned.toFixed(2)} ₽</strong>
                      </div>
                      <div>
                        <div style={{ color: '#6B7280' }}>Новое тело вклада:</div>
                        <strong style={{ color: '#2563EB' }}>{deposit.calculated_balance.toLocaleString()} ₽</strong>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', borderTop: '1px dashed #E5E7EB', paddingTop: '12px', marginBottom: '20px', fontSize: '0.9rem' }}>
                      <div>
                        <div style={{ color: '#6B7280' }}>Старые условия:</div>
                        <div style={{ fontWeight: '500' }}>{(deposit.interest_rate * 100).toFixed(1)}% за {deposit.period_days} дней</div>
                      </div>
                      <div>
                        <div style={{ color: '#6B7280' }}>Новые условия:</div>
                        <div style={{ color: '#D97706', fontWeight: 'bold' }}>
                          {(deposit.pending_interest_rate * 100).toFixed(1)}% за {deposit.pending_period_days} дней
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={() => handleApproveRateChange(deposit.id)}
                        style={{ backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s' }}
                        onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
                        onMouseOut={(e) => e.target.style.backgroundColor = '#10B981'}
                      >
                        Принять новые условия
                      </button>
                      <button 
                        onClick={() => handleDeclineRateChange(deposit.id)}
                        style={{ backgroundColor: 'white', color: '#4B5563', border: '1px solid #D1D5DB', borderRadius: '6px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s' }}
                        onMouseOver={(e) => e.target.style.backgroundColor = '#F9FAFB'}
                        onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
                      >
                        Оставить прежние
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Stats Cards */}
      <section className="stats-section">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#3B82F6' }}>
              <DollarSign size={24} color="white" />
            </div>
            <div className="stat-content">
              <h3>{stats.total_current.toLocaleString()} ₽</h3>
              <p>На счёте сейчас</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#10B981' }}>
              <PiggyBank size={24} color="white" />
            </div>
            <div className="stat-content">
              <h3>{stats.total_invested.toLocaleString()} ₽</h3>
              <p>Всего инвестировано</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#F59E0B' }}>
              <TrendingUp size={24} color="white" />
            </div>
            <div className="stat-content">
              <h3>{stats.total_interest_earned.toLocaleString()} ₽</h3>
              <p>Заработано процентов</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#8B5CF6' }}>
              <BarChart3 size={20} color="white" />
            </div>
            <div className="stat-content">
              <h3>{stats.active_deposits}</h3>
              <p>Активных вкладов</p>
            </div>
          </div>
        </div>
      </section>

      {/* Deposits List */}
      <section className="deposits-section">
        <div className="section-header">
          <h2>
            <PiggyBank size={24} />
            Мои вклады
          </h2>
          <button onClick={fetchDashboardData} className="refresh-btn">
            Обновить
          </button>
        </div>

        {deposits.length === 0 ? (
          <div className="empty-state">
            <PiggyBank size={48} className="empty-icon" />
            <h3>У вас ещё нет вкладов</h3>
            <p>Создайте первый вклад, чтобы начать зарабатывать проценты!</p>
            <button 
              onClick={() => setShowNewDepositModal(true)} 
              className="primary-btn"
            >
              <Plus size={18} />
              Создать вклад
            </button>
          </div>
        ) : (
          <div className="deposits-grid">
            {deposits.map((deposit) => (
              <div 
                key={deposit.id} 
                className="deposit-card"
                style={{ borderLeft: `4px solid ${getBankColor(deposit.bank)}` }}
              >
                <div className="deposit-header">
                  <div className="bank-info">
                    <span className="bank-icon">{getBankIcon(deposit.bank)}</span>
                    <span className="bank-name">{bankSettings[deposit.bank]?.display_name || deposit.bank}</span>
                  </div>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(deposit.status) }}
                  >
                    {deposit.status === 'active' ? 'Активен' : 
                     deposit.status === 'pending' ? 'Ожидание' : 'Закрыт'}
                  </span>
                </div>

                <div className="deposit-amounts">
                  <div className="amount-item">
                    <span className="label">Начальная сумма:</span>
                    <span className="value">{deposit.amount.toLocaleString()} ₽</span>
                  </div>
                  <div className="amount-item">
                    <span className="label">Текущий баланс:</span>
                    <span className="value">{deposit.calculated_balance.toLocaleString()} ₽</span>
                  </div>
                  <div className="amount-item">
                    <span className="label">Заработано:</span>
                    <span className="value">
                      {(deposit.calculated_balance - deposit.amount).toFixed(2)} ₽
                    </span>
                  </div>
                </div>

                <div className="deposit-meta">
                  <div className="meta-item">
                    <Clock size={14} />
                    <span>{Math.floor((new Date() - new Date(deposit.created_at)) / (1000 * 60 * 60 * 24))} дней</span>
                  </div>
                  <div className="meta-item">
                    <span>Ставка: {deposit.interest_rate * 100}%</span>
                  </div>
                  <div className="meta-item">
                    <span>Период: {deposit.period_days} дней</span>
                  </div>
                </div>

                <div className="deposit-actions">
                  {deposit.status === 'active' && (
                    <button 
                      onClick={() => handleRequestWithdrawal(deposit.id)}
                      className="action-btn withdraw"
                    >
                      Снять средства
                    </button>
                  )}
                  <button 
                    onClick={() => setSelectedDeposit(deposit)}
                    className="action-btn details"
                  >
                    <Eye size={16} />
                    Подробнее
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* New Deposit Modal */}
      {showNewDepositModal && (
        <div className="modal-overlay" onClick={() => setShowNewDepositModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Создать новый вклад</h3>
              <button 
                className="close-btn" 
                onClick={() => setShowNewDepositModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateDeposit} className="new-deposit-form">
              <div className="form-group">
                <label>Выберите банк:</label>
                <div className="bank-options">
                  {Object.keys(bankSettings).map((bankKey) => {
                    const settings = bankSettings[bankKey];
                    return (
                      <label key={bankKey} className="bank-option">
                        <input
                          type="radio"
                          name="bank"
                          value={bankKey}
                          checked={newDepositForm.bank === bankKey}
                          onChange={(e) => setNewDepositForm({...newDepositForm, bank: e.target.value})}
                        />
                        <div className="bank-card">
                          <span className="bank-icon">
                            {getBankIcon(bankKey)}
                          </span>
                          <div>
                            <h4>{settings.display_name || bankKey}</h4>
                            <ul>
                              <li>{(settings.interest_rate * 100).toFixed(1)}% за {settings.period_days} дней</li>
                              <li>Минимум: {settings.min_amount} ₽</li>
                              <li>{settings.penalty_rate === 0 ? 'Нет штрафа за досрочный вывод' : `-${(settings.penalty_rate * 100).toFixed(1)}% штраф за досрочный вывод`}</li>
                            </ul>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="amount">Сумма вклада (₽):</label>
                <input
                  type="number"
                  id="amount"
                  value={newDepositForm.amount}
                  onChange={(e) => setNewDepositForm({...newDepositForm, amount: e.target.value})}
                  placeholder={`Минимум: ${bankSettings[newDepositForm.bank]?.min_amount || 0} ₽`}
                  min={bankSettings[newDepositForm.bank]?.min_amount || 0}
                  required
                />
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => setShowNewDepositModal(false)}>
                  Отмена
                </button>
                <button type="submit" className="primary-btn">
                  Создать вклад
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Details Modal */}
      {selectedDeposit && (
        <div className="modal-overlay" onClick={() => setSelectedDeposit(null)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Детали вклада</h3>
              <button 
                className="close-btn" 
                onClick={() => setSelectedDeposit(null)}
              >
                ×
              </button>
            </div>

            <div className="deposit-details">
              <div className="deposit-summary">
                <div className="summary-item">
                  <span className="label">Банк:</span>
                  <span className="value">
                    {getBankIcon(selectedDeposit.bank)} {bankSettings[selectedDeposit.bank]?.display_name || selectedDeposit.bank}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">Статус:</span>
                  <span 
                    className="value status-value"
                    style={{ color: getStatusColor(selectedDeposit.status) }}
                  >
                    {selectedDeposit.status === 'active' ? 'Активен' : 
                     selectedDeposit.status === 'pending' ? 'Ожидание' : 'Закрыт'}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">Дата создания:</span>
                  <span className="value">
                    {new Date(selectedDeposit.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="amount-breakdown">
                <div className="breakdown-item">
                  <span>Начальная сумма:</span>
                  <span>{selectedDeposit.amount.toLocaleString()} ₽</span>
                </div>
                <div className="breakdown-item">
                  <span>Текущий баланс:</span>
                  <span>{selectedDeposit.calculated_balance.toLocaleString()} ₽</span>
                </div>
                <div className="breakdown-item">
                  <span>Заработано процентов:</span>
                  <span>{(selectedDeposit.calculated_balance - selectedDeposit.amount).toFixed(2)} ₽</span>
                </div>
              </div>

              <div className="forecast-section">
                <h4>Прогноз доходности</h4>
                <div className="forecast-values">
                  {['in_7_days', 'in_14_days', 'in_30_days', 'in_90_days'].map((period) => (
                    <div key={period} className="forecast-item">
                      <span>{period === 'in_7_days' ? '7 дней' : 
                            period === 'in_14_days' ? '14 дней' : 
                            period === 'in_30_days' ? '30 дней' : '90 дней'}:</span>
                      <span>{selectedDeposit[period]?.toLocaleString() || 'N/A'} ₽</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="actions-section">
                {selectedDeposit.status === 'active' && (
                  <button 
                    onClick={() => {
                      handleRequestWithdrawal(selectedDeposit.id);
                      setSelectedDeposit(null);
                    }}
                    className="danger-btn"
                  >
                    Запросить снятие
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChildDashboard;