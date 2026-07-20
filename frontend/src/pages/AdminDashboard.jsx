import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DollarSign, Users, Clock, TrendingUp, CheckCircle, XCircle, Eye, Calendar, BarChart3, Settings } from 'lucide-react';
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
  const [successMessage, setSuccessMessage] = useState('');
  const [activeTab, setActiveTab] = useState('operations'); // 'operations' or 'settings'

  const [bankSettings, setBankSettings] = useState({
    mama: { interest_rate: 0.035, period_days: 14, min_amount: 1000, penalty_rate: 0.0, display_name: 'Мама-банк' },
    papa: { interest_rate: 0.11, period_days: 30, min_amount: 2000, penalty_rate: 0.02, display_name: 'Папа-банк' }
  });

  const [forms, setForms] = useState({});
  const [newBank, setNewBank] = useState({
    id: '',
    display_name: '',
    interest_rate: 3.5,
    period_days: 14,
    min_amount: 1000,
    penalty_rate: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    const initialForms = {};
    Object.keys(bankSettings).forEach(bankKey => {
      initialForms[bankKey] = {
        interest_rate: bankSettings[bankKey].interest_rate * 100,
        period_days: bankSettings[bankKey].period_days,
        min_amount: bankSettings[bankKey].min_amount,
        penalty_rate: bankSettings[bankKey].penalty_rate * 100,
        display_name: bankSettings[bankKey].display_name || bankKey
      };
    });
    setForms(initialForms);
  }, [bankSettings]);

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

      // Fetch bank settings
      const settingsResponse = await axios.get('/settings');
      setBankSettings(settingsResponse.data);
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

  const handleSaveSettings = async (bank, formData) => {
    try {
      setError('');
      setSuccessMessage('');

      const payload = {
        interest_rate: parseFloat(formData.interest_rate) / 100,
        period_days: parseInt(formData.period_days),
        min_amount: parseFloat(formData.min_amount),
        penalty_rate: parseFloat(formData.penalty_rate) / 100,
        display_name: formData.display_name
      };

      const response = await axios.put(`/settings/${bank}`, payload);
      setSuccessMessage(response.data.message);

      // Refresh settings
      const settingsResponse = await axios.get('/settings');
      setBankSettings(settingsResponse.data);

      // Clear success message after 4 seconds
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка сохранения настроек');
    }
  };

  const handleCreateBank = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setSuccessMessage('');

      const payload = {
        id: newBank.id.trim().toLowerCase(),
        display_name: newBank.display_name.trim(),
        interest_rate: parseFloat(newBank.interest_rate) / 100,
        period_days: parseInt(newBank.period_days),
        min_amount: parseFloat(newBank.min_amount),
        penalty_rate: parseFloat(newBank.penalty_rate) / 100
      };

      if (!payload.id || !payload.display_name) {
        setError('Идентификатор и название банка обязательны');
        return;
      }

      const response = await axios.post('/settings', payload);
      setSuccessMessage(response.data.message);
      
      // Reset new bank form
      setNewBank({
        id: '',
        display_name: '',
        interest_rate: 3.5,
        period_days: 14,
        min_amount: 1000,
        penalty_rate: 0
      });

      // Refresh settings
      const settingsResponse = await axios.get('/settings');
      setBankSettings(settingsResponse.data);

      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Ошибка создания банка');
    }
  };

  const handleFormChange = (bankKey, field, value) => {
    setForms(prev => ({
      ...prev,
      [bankKey]: {
        ...prev[bankKey],
        [field]: value
      }
    }));
  };

  const getBankColor = (bank) => {
    if (bank === 'mama') return '#FF6B6B';
    if (bank === 'papa') return '#3B82F6';
    if (bank === 'babushka') return '#10B981';
    return '#8B5CF6';
  };

  const getBankIcon = (bank) => {
    if (!bank) return '👑';
    if (bank === 'mama') return '🏠';
    if (bank === 'papa') return '🏖️';
    if (bank === 'babushka') return '👵';
    return '🏦';
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
            <h1>{user.bank ? (bankSettings[user.bank]?.display_name || user.bank) : 'Мама-Папа-Дети Банк'} Admin Panel</h1>
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

      {/* Tab Navigation */}
      <div className="tab-navigation-container">
        <button 
          className={`tab-btn ${activeTab === 'operations' ? 'active' : ''}`}
          onClick={() => { setActiveTab('operations'); setError(''); setSuccessMessage(''); }}
        >
          <Clock size={18} />
          Ожидающие заявки ({pendingOperations.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => { setActiveTab('settings'); setError(''); setSuccessMessage(''); }}
        >
          <Settings size={18} />
          Настройки вкладов
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'operations' ? (
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
                        {bankSettings[operation.bank]?.display_name || operation.bank}
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
                      <span className="value">{bankSettings[operation.bank]?.display_name || operation.bank}</span>
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
      ) : (
        <section className="settings-section">
          <div className="section-header">
            <h2>
              <Settings size={24} />
              Настройка условий вкладов
            </h2>
          </div>

          {successMessage && (
            <div className="success-banner">
              {successMessage}
            </div>
          )}

          <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Create New Bank Card - Only for Super Admins */}
            {!user.bank && (
              <div className="settings-card" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '20px', borderRadius: '12px' }}>
                <div className="settings-card-header" style={{ borderLeft: '4px solid #10B981', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                  <span className="bank-icon">✨</span>
                  <h3 style={{ margin: 0, color: '#166534' }}>Создать новый банк</h3>
                </div>
                <form onSubmit={handleCreateBank} className="settings-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Идентификатор банка (англ.)</label>
                    <input 
                      type="text" 
                      placeholder="например: babushka"
                      required
                      value={newBank.id} 
                      onChange={(e) => setNewBank({ ...newBank, id: e.target.value.toLowerCase().replace(/[^a-z]/g, '') })}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                    />
                    <small className="help-text" style={{ fontSize: '0.75rem', color: '#6B7280' }}>Только латинские строчные буквы</small>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Название банка</label>
                    <input 
                      type="text" 
                      placeholder="например: Бабушка-банк"
                      required
                      value={newBank.display_name} 
                      onChange={(e) => setNewBank({ ...newBank, display_name: e.target.value })}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                    />
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Процентная ставка за период (%)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={newBank.interest_rate} 
                      onChange={(e) => setNewBank({ ...newBank, interest_rate: e.target.value })}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Период начисления (дней)</label>
                    <input 
                      type="number" 
                      value={newBank.period_days} 
                      onChange={(e) => setNewBank({ ...newBank, period_days: e.target.value })}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Минимальная сумма вклада (₽)</label>
                    <input 
                      type="number" 
                      value={newBank.min_amount} 
                      onChange={(e) => setNewBank({ ...newBank, min_amount: e.target.value })}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Штраф за досрочное снятие (%)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      value={newBank.penalty_rate} 
                      onChange={(e) => setNewBank({ ...newBank, penalty_rate: e.target.value })}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  
                  <button 
                    type="submit"
                    className="save-settings-btn" 
                    style={{ backgroundColor: '#10B981', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s', marginTop: '10px' }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#10B981'}
                  >
                    Создать банк
                  </button>
                </form>
              </div>
            )}

            {/* Dynamic Bank Configuration Forms */}
            {Object.keys(bankSettings).map((bankKey) => {
              const settings = bankSettings[bankKey];
              const formData = forms[bankKey];

              // Filter settings depending on roles
              if (user.bank && user.bank !== bankKey) return null;
              if (!formData) return null;

              return (
                <div key={bankKey} className="settings-card" style={{ border: '1px solid #E5E7EB', padding: '20px', borderRadius: '12px', backgroundColor: 'white' }}>
                  <div className="settings-card-header" style={{ borderLeft: `4px solid ${getBankColor(bankKey)}`, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                    <span className="bank-icon">{getBankIcon(bankKey)}</span>
                    <h3 style={{ margin: 0 }}>Условия вкладов {settings.display_name || bankKey}</h3>
                  </div>
                  <div className="settings-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Отображаемое название банка</label>
                      <input 
                        type="text" 
                        value={formData.display_name || ''} 
                        onChange={(e) => handleFormChange(bankKey, 'display_name', e.target.value)}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                      />
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Процентная ставка за период (%)</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={formData.interest_rate || 0} 
                        onChange={(e) => handleFormChange(bankKey, 'interest_rate', e.target.value)}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                      />
                      <small className="help-text" style={{ fontSize: '0.75rem', color: '#6B7280' }}>Например, 3.5%</small>
                    </div>
                    
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Период начисления (дней)</label>
                      <input 
                        type="number" 
                        value={formData.period_days || 1} 
                        onChange={(e) => handleFormChange(bankKey, 'period_days', e.target.value)}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                      />
                      <small className="help-text" style={{ fontSize: '0.75rem', color: '#6B7280' }}>Капитализация процентов каждые X дней</small>
                    </div>
                    
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Минимальная сумма вклада (₽)</label>
                      <input 
                        type="number" 
                        value={formData.min_amount || 0} 
                        onChange={(e) => handleFormChange(bankKey, 'min_amount', e.target.value)}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                      />
                    </div>
                    
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontWeight: '500', fontSize: '0.9rem', color: '#374151' }}>Штраф за досрочное снятие (%)</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        value={formData.penalty_rate || 0} 
                        onChange={(e) => handleFormChange(bankKey, 'penalty_rate', e.target.value)}
                        style={{ padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                      />
                    </div>
                    
                    <button 
                      className="save-settings-btn" 
                      style={{ backgroundColor: getBankColor(bankKey), color: 'white', padding: '10px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s', marginTop: '10px' }}
                      onClick={() => handleSaveSettings(bankKey, formData)}
                    >
                      Сохранить условия {settings.display_name || bankKey}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminDashboard;
