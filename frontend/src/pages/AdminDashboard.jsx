import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DollarSign, Users, Clock, TrendingUp, CheckCircle, XCircle, Eye, Calendar, BarChart3 } from 'lucide-react';
import './AdminDashboard.css';

const AdminDashboard = ({ user, onLogout }) => {
  const [pendingOperations, setPendingOperations] = useState([]);
  const [stats, setStats] = useState({
    total_children: 0,
    total_invested: 0,
    pending_operations: 0,
    total_interest_paid: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch pending operations
      const operationsResponse = await axios.get('/operations/pending');
      setPendingOperations(operationsResponse.data);

      // Fetch overall stats
      const statsResponse = await axios.get('/analytics/overall-stats');
      setStats(statsResponse.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (operationId) => {
    try {
      await axios.post(`/operations/${operationId}/approve`);
      fetchDashboardData(); // Refresh data
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка при одобрении');
    }
  };

  const handleReject = async (operationId) => {
    try {
      await axios.post(`/operations/${operationId}/reject`);
      fetchDashboardData(); // Refresh data
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка при отклонении');
    }
  };

  const getBankColor = (bank) => {
    return bank === 'mama' ? '#FF6B6B' : '#4ECDC4';
  };

  const getBankIcon = (bank) => {
    return bank === 'mama' ? '🏠' : '🏖️';
  };

  if (loading) {
    return (
      <div className="admin-dashboard loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Загрузка данных...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="bank-header">
            <span className="bank-icon">{getBankIcon(user.bank)}</span>
            <h1>{user.bank === 'mama' ? 'Мама-банк' : 'Папа-банк'} Admin Panel</h1>
          </div>
          <div className="user-info">
            <span>Привет, {user.name}!</span>
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
              <Users size={24} color="white" />
            </div>
            <div className="stat-content">
              <h3>{stats.total_children}</h3>
              <p>Детей в системе</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#10B981' }}>
              <DollarSign size={24} color="white" />
            </div>
            <div className="stat-content">
              <h3>{stats.total_invested.toLocaleString()} ₽</h3>
              <p>Инвестировано всего</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#F59E0B' }}>
              <Clock size={24} color="white" />
            </div>
            <div className="stat-content">
              <h3>{stats.pending_operations}</h3>
              <p>Ожидающих операций</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#8B5CF6' }}>
              <TrendingUp size={24} color="white" />
            </div>
            <div className="stat-content">
              <h3>{stats.total_interest_paid.toLocaleString()} ₽</h3>
              <p>Процентов начислено</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pending Operations */}
      <section className="pending-section">
        <div className="section-header">
          <h2>
            <BarChart3 size={24} />
            Ожидающие операции
          </h2>
          <button onClick={fetchDashboardData} className="refresh-btn">
            Обновить
          </button>
        </div>

        {pendingOperations.length === 0 ? (
          <div className="empty-state">
            <Clock size={48} className="empty-icon" />
            <h3>Нет ожидающих операций</h3>
            <p>Все операции обработаны</p>
          </div>
        ) : (
          <div className="operations-list">
            {pendingOperations.map((operation) => (
              <div key={operation.id} className="operation-card">
                <div className="operation-header">
                  <div className="operation-type">
                    <span className="bank-badge" style={{ backgroundColor: getBankColor(operation.bank) }}>
                      {operation.bank === 'mama' ? 'Мама' : 'Папа'}
                    </span>
                    <span className="type-label">
                      {operation.type === 'open' ? 'Открытие вклада' : 'Снятие средств'}
                    </span>
                  </div>
                  <div className="operation-date">
                    <Calendar size={16} />
                    {new Date(operation.requested_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="operation-details">
                  <div className="detail-item">
                    <span className="label">Ребёнок:</span>
                    <span className="value">{operation.child_name}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Сумма:</span>
                    <span className="value">{operation.deposit_amount?.toLocaleString()} ₽</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Банк:</span>
                    <span className="value">{operation.bank === 'mama' ? 'Мама-банк' : 'Папа-банк'}</span>
                  </div>
                </div>

                <div className="operation-actions">
                  <button 
                    onClick={() => handleApprove(operation.id)}
                    className="action-btn approve"
                  >
                    <CheckCircle size={18} />
                    Одобрить
                  </button>
                  <button 
                    onClick={() => handleReject(operation.id)}
                    className="action-btn reject"
                  >
                    <XCircle size={18} />
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminDashboard;