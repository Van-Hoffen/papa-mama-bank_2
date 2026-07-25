import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { User, Globe, Shield, X, Check } from 'lucide-react';
import HelpTooltip from './HelpTooltip';

export default function ProfileModal({ user, onClose, onUserUpdated, addToast }) {
  const { t, i18n } = useTranslation(['common', 'auth', 'tooltips']);
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || user?.preferredLocale || 'ru');
  const [saving, setSaving] = useState(false);

  const handleLanguageSelect = async (lang) => {
    setSelectedLanguage(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem('app_language', lang);

    try {
      setSaving(true);
      const res = await axios.patch('/profile/preferences', { preferredLocale: lang });
      if (onUserUpdated && res.data?.user) {
        onUserUpdated(res.data.user);
      }
      if (addToast) {
        addToast(t('common:language.hint', 'Выбор языка применяется немедленно.'), 'success');
      }
    } catch (err) {
      if (addToast) {
        addToast(err.response?.data?.error || t('common:unknown'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-400" />
            {t('common:nav.profile', 'Профиль и настройки')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="close-btn"
            aria-label={t('common:actions.close', 'Закрыть')}
          >
            &times;
          </button>
        </div>

        <div className="modal__body space-y-6">
          {/* User Info Overview */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-bold text-xl flex items-center justify-center shrink-0">
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h4 className="font-bold text-slate-100 text-base">{user?.displayName || user?.username}</h4>
              <p className="text-xs text-slate-400">{user?.email || `@${user?.username}`}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800/80 rounded text-[10px] font-medium flex items-center gap-1">
                  <Shield className="w-3 h-3 text-indigo-400" />
                  {user?.familyRole ? t(`common:roles.${user.familyRole}`, user.familyRole) : t('common:roles.child')}
                </span>
              </div>
            </div>
          </div>

          {/* Language Selection Card */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-indigo-400" />
                <span>{t('common:language.label', 'Язык интерфейса')}</span>
              </label>
              <HelpTooltip tooltipKey="profile.preferredLocale" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleLanguageSelect('ru')}
                className={`p-3 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                  selectedLanguage.startsWith('ru')
                    ? 'bg-indigo-950/60 border-indigo-600 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🇷🇺</span>
                  <span className="text-xs font-bold">{t('common:language.ru', 'Русский')}</span>
                </div>
                {selectedLanguage.startsWith('ru') && <Check className="w-4 h-4 text-indigo-400" />}
              </button>

              <button
                type="button"
                onClick={() => handleLanguageSelect('en')}
                className={`p-3 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                  selectedLanguage.startsWith('en')
                    ? 'bg-indigo-950/60 border-indigo-600 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">🇬🇧</span>
                  <span className="text-xs font-bold">{t('common:language.en', 'English')}</span>
                </div>
                {selectedLanguage.startsWith('en') && <Check className="w-4 h-4 text-indigo-400" />}
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {t('common:language.hint', 'Выбор языка применяется немедленно.')}
            </p>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
            >
              {t('common:actions.close', 'Закрыть')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
