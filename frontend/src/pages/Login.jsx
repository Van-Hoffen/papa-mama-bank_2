import React, { useState } from 'react';
import axios from 'axios';
import { User, Lock, LogIn, Eye, EyeOff, Building, Mail, ShieldAlert } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState('parent'); // 'parent', 'child', 'register'
  const [showPassword, setShowPassword] = useState(false);
  
  // Verification step after registration
  const [isVerifying, setIsVerifying] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    familySlug: '',
    childUsername: '',
    familyName: '',
    adminName: '',
    timezone: 'Europe/Moscow'
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
    setSuccess('');
  };

  const handleVerificationSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const verifyRes = await axios.post('/auth/verify-email', {
        email: registeredEmail,
        code: verificationCode.trim()
      });

      setSuccess('Email успешно подтвержден! Выполняем автоматический вход...');

      // Auto login
      const loginResponse = await axios.post('/auth/login', {
        email: registeredEmail,
        password: formData.password
      });

      setTimeout(() => {
        onLogin(loginResponse.data.user, loginResponse.data.token);
      }, 1000);

    } catch (err) {
      setError(err.response?.data?.error || 'Неверный код подтверждения.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (activeTab === 'parent') {
        // Adult Login
        if (!formData.email || !formData.password) {
          throw new Error('Пожалуйста, введите email и пароль.');
        }

        const response = await axios.post('/auth/login', {
          email: formData.email,
          password: formData.password
        });

        onLogin(response.data.user, response.data.token);

      } else if (activeTab === 'child') {
        // Child Login: slug + childUsername & password
        if (!formData.familySlug || !formData.childUsername || !formData.password) {
          throw new Error('Заполните идентификатор семьи, логин ребенка и пароль.');
        }

        const cleanSlug = formData.familySlug.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const cleanChild = formData.childUsername.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const combinedUsername = `${cleanSlug}_${cleanChild}`;

        const response = await axios.post('/auth/login', {
          username: combinedUsername,
          password: formData.password
        });

        onLogin(response.data.user, response.data.token);

      } else {
        // Register Family Space
        if (!formData.familyName || !formData.adminName || !formData.email || !formData.password) {
          throw new Error('Все поля обязательны для регистрации.');
        }

        if (formData.password.length < 10) {
          throw new Error('Пароль взрослого должен быть не менее 10 символов.');
        }

        await axios.post('/auth/register-family', {
          familyName: formData.familyName,
          adminName: formData.adminName,
          adminEmail: formData.email,
          adminPassword: formData.password,
          timezone: formData.timezone
        });

        setRegisteredEmail(formData.email);
        setIsVerifying(true);
        setSuccess('Регистрация успешна! Код верификации отправлен на ваш email (проверьте консоль dev-сервера).');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Произошла непредвиденная ошибка.');
    } finally {
      setLoading(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div id="verification-card" className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <Mail className="h-12 w-12 text-indigo-400 mx-auto" />
            <h2 className="text-2xl font-bold text-slate-100 font-sans tracking-tight">Подтверждение Email</h2>
            <p className="text-sm text-slate-400">
              Мы отправили проверочный код на адрес <strong className="text-indigo-300">{registeredEmail}</strong>. 
              Загляните в консоль разработчика вашего сервера Node.js, чтобы увидеть отправленный код.
            </p>
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm p-4 rounded-xl flex items-start gap-2">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-sm p-4 rounded-xl">
              {success}
            </div>
          )}

          <form onSubmit={handleVerificationSubmit} className="space-y-4">
            <div>
              <label htmlFor="verify-code" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                6-значный код подтверждения
              </label>
              <input
                id="verify-code"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                required
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-3 text-center text-2xl font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
              />
            </div>

            <button
              id="btn-verify"
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-indigo-800/50 text-white font-semibold py-3 px-4 rounded-xl transition shadow-lg shadow-indigo-600/20"
            >
              {loading ? 'Подтверждение...' : 'Подтвердить и Войти'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12">
      <div id="login-card" className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Decorative Header */}
        <div className="bg-gradient-to-r from-indigo-950 to-slate-900 p-8 text-center border-b border-slate-800/60">
          <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight font-sans">
            👨‍👩‍👧‍👦 Мама-Папа Банк
          </h1>
          <p className="text-xs text-indigo-300/80 mt-1 uppercase tracking-widest font-semibold">
            Мультисемейная SaaS-платформа
          </p>
        </div>

        <div className="p-8 space-y-6">
          {/* Navigation Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/60">
            <button
              id="tab-parent"
              type="button"
              onClick={() => { setActiveTab('parent'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'parent' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Родителям
            </button>
            <button
              id="tab-child"
              type="button"
              onClick={() => { setActiveTab('child'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'child' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Детям
            </button>
            <button
              id="tab-register"
              type="button"
              onClick={() => { setActiveTab('register'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'register' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Создать Семью
            </button>
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm p-4 rounded-xl flex items-start gap-2">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-sm p-4 rounded-xl">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {activeTab === 'register' && (
              <>
                <div>
                  <label htmlFor="familyName" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Название семьи (например, Ивановы)
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                    <input
                      id="familyName"
                      type="text"
                      name="familyName"
                      value={formData.familyName}
                      onChange={handleChange}
                      placeholder="Ивановы"
                      required
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="adminName" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Ваше Имя
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                    <input
                      id="adminName"
                      type="text"
                      name="adminName"
                      value={formData.adminName}
                      onChange={handleChange}
                      placeholder="Алексей"
                      required
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'child' && (
              <>
                <div>
                  <label htmlFor="familySlug" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Адрес Семьи (Family Slug)
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                    <input
                      id="familySlug"
                      type="text"
                      name="familySlug"
                      value={formData.familySlug}
                      onChange={handleChange}
                      placeholder="ivanovy"
                      required
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="childUsername" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Логин ребенка
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                    <input
                      id="childUsername"
                      type="text"
                      name="childUsername"
                      value={formData.childUsername}
                      onChange={handleChange}
                      placeholder="masha"
                      required
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab !== 'child' && (
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Электронная почта (Email)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="name@example.com"
                    required
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Пароль
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder={activeTab === 'register' ? 'Минимум 10 символов' : '••••••••'}
                  required
                  minLength={activeTab === 'register' ? 10 : 6}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl pl-11 pr-11 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 transition"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {activeTab === 'register' && (
              <div>
                <label htmlFor="timezone" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Часовой пояс
                </label>
                <select
                  id="timezone"
                  name="timezone"
                  value={formData.timezone}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                >
                  <option value="Europe/Moscow">Москва (UTC+3)</option>
                  <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
                  <option value="Asia/Novosibirsk">Новосибирск (UTC+7)</option>
                  <option value="Asia/Vladivostok">Владивосток (UTC+10)</option>
                  <option value="UTC">UTC / Гринвич</option>
                </select>
              </div>
            )}

            <button
              id="btn-login-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-indigo-800/50 text-white font-semibold py-3 px-4 rounded-xl transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  {activeTab === 'register' ? 'Создание...' : 'Вход...'}
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  {activeTab === 'register' ? 'Зарегистрировать Семью' : 'Войти в Систему'}
                </>
              )}
            </button>
          </form>

          {/* Quick Info footer */}
          <div className="text-center">
            <p className="text-xs text-slate-500">
              {activeTab === 'child' 
                ? 'Ребенок заходит по адресу, выданному родителями (slug) и логину.' 
                : 'Безопасное SaaS-пространство с изоляцией данных и защитой сессий.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
