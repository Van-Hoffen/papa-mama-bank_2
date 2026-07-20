import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User, Lock, LogIn, Eye, EyeOff } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [banks, setBanks] = useState([]);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: 'child',
    bank: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const response = await axios.get('/settings');
        setBanks(Object.keys(response.data).map(key => ({
          id: key,
          display_name: response.data[key].display_name || key
        })));
      } catch (err) {
        console.error('Error fetching banks:', err);
      }
    };
    fetchBanks();
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // Login
        const response = await axios.post('/auth/login', {
          username: formData.username,
          password: formData.password
        });

        onLogin(response.data.user, response.data.token);
      } else {
        // Registration validation
        if (!formData.name.trim()) {
          throw new Error('Имя обязательно');
        }

        if (formData.role === 'admin' && formData.bank) {
          throw new Error('Главный администратор не может иметь банк');
        }

        if ((formData.role === 'bank-admin' || formData.role === 'mama-admin' || formData.role === 'papa-admin') && !formData.bank) {
          throw new Error('Необходимо выбрать банк для администратора');
        }

        if (formData.role === 'child' && formData.bank) {
          throw new Error('Ребёнок не может иметь банк');
        }

        // Register
        const response = await axios.post('/auth/register', {
          username: formData.username,
          password: formData.password,
          name: formData.name,
          role: formData.role,
          bank: formData.bank || null
        });

        // Auto-login after registration
        const loginResponse = await axios.post('/auth/login', {
          username: formData.username,
          password: formData.password
        });

        onLogin(loginResponse.data.user, loginResponse.data.token);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>{isLogin ? 'Вход в систему' : 'Регистрация'}</h1>
          <p className="subtitle">
            {isLogin 
              ? 'Введите свои данные для входа' 
              : 'Создайте новый аккаунт'}
          </p>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">
              <User size={18} />
              Логин
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Введите логин"
              required
              minLength={4}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              <Lock size={18} />
              Пароль
            </label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Введите пароль"
                required
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {!isLogin && (
            <>
              <div className="form-group">
                <label htmlFor="name">
                  <User size={18} />
                  Имя
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Введите ваше имя"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="role">Роль</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                >
                  <option value="child">Ребёнок</option>
                  <option value="admin">Главный администратор (Все банки)</option>
                  <option value="bank-admin">Администратор банка</option>
                  <option value="mama-admin">Мама-администратор</option>
                  <option value="papa-admin">Папа-администратор</option>
                </select>
              </div>

              {(formData.role === 'bank-admin' || formData.role === 'mama-admin' || formData.role === 'papa-admin') && (
                <div className="form-group">
                  <label htmlFor="bank">Банк</label>
                  <select
                    id="bank"
                    name="bank"
                    value={formData.bank}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Выберите банк</option>
                    {banks.map(bank => (
                      <option key={bank.id} value={bank.id}>
                        {bank.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? (
              <>
                <div className="spinner"></div>
                {isLogin ? 'Вход...' : 'Регистрация...'}
              </>
            ) : (
              <>
                {isLogin ? <LogIn size={18} /> : null}
                {isLogin ? 'Войти' : 'Зарегистрироваться'}
              </>
            )}
          </button>
        </form>

        <div className="switch-mode">
          <p>
            {isLogin 
              ? 'Нет аккаунта? ' 
              : 'Уже есть аккаунт? '}
            <button 
              type="button" 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setFormData({
                  username: '',
                  password: '',
                  name: '',
                  role: 'child',
                  bank: ''
                });
              }}
            >
              {isLogin ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </p>
        </div>

        {/* Demo credentials */}
        <div className="demo-section">
          <h3>Демо-аккаунты:</h3>
          <div className="demo-creds">
            <p><strong>Супер-админ:</strong> admin / admin123</p>
            <p><strong>Мама-банк:</strong> mama_admin / password123</p>
            <p><strong>Папа-банк:</strong> papa_admin / password123</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;