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
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDeposit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/deposits', {
        bank: newDepositForm.bank,
        amount: parseFloat(newDepositForm.amount)
      });
      setShowNewDepositModal(false);
      setNewDepositForm({ bank: 'mama', amount: '' });
      fetchDashboardData(); // Refresh data
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка создания вклада');
    }
  };

  const handleRequestWithdrawal = async (depositId) => {
    try {
      await axios.post('/operations/request', {
        deposit_id: depositId,
        type: 'withdraw'
      });
      fetchDashboardData(); // Refresh data
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка запроса снятия');
    }
  };

  const getBankColor = (bank) => {
    return bank === 'mama' ? '#FF6B6B' : '#4ECDC4';
  };

  const getBankIcon = (bank) => {
    return bank === 'mama' ? '🏠' : '🏖️';
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
                    <span className="bank-name">{deposit.bank === 'mama' ? 'Мама-банк' : 'Папа-банк'}</span>
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
                  <label className="bank-option">
                    <input
                      type="radio"
                      name="bank"
                      value="mama"
                      checked={newDepositForm.bank === 'mama'}
                      onChange={(e) => setNewDepositForm({...newDepositForm, bank: e.target.value})}
                    />
                    <div className="bank-card">
                      <span className="bank-icon">🏠</span>
                      <div>
                        <h4>Мама-банк</h4>
                        <ul>
                          <li>3.5% за 14 дней</li>
                          <li>Минимум: 1000 ₽</li>
                          <li>Нет штрафа за досрочный вывод</li>
                        </ul>
                      </div>
                    </div>
                  </label>

                  <label className="bank-option">
                    <input
                      type="radio"
                      name="bank"
                      value="papa"
                      checked={newDepositForm.bank === 'papa'}
                      onChange={(e) => setNewDepositForm({...newDepositForm, bank: e.target.value})}
                    />
                    <div className="bank-card">
                      <span className="bank-icon">🏖️</span>
                      <div>
                        <h4>Папа-банк</h4>
                        <ul>
                          <li>11% за 30 дней</li>
                          <li>Минимум: 2000 ₽</li>
                          <li>-2% штраф за досрочный вывод</li>
                        </ul>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="amount">Сумма вклада (₽):</label>
                <input
                  type="number"
                  id="amount"
                  value={newDepositForm.amount}
                  onChange={(e) => setNewDepositForm({...newDepositForm, amount: e.target.value})}
                  placeholder={`Минимум: ${newDepositForm.bank === 'mama' ? '1000' : '2000'} ₽`}
                  min={newDepositForm.bank === 'mama' ? '1000' : '2000'}
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
                    {getBankIcon(selectedDeposit.bank)} {selectedDeposit.bank === 'mama' ? 'Мама-банк' : 'Папа-банк'}
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