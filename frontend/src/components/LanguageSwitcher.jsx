import React from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

export default function LanguageSwitcher({ user, onLanguageChange }) {
  const { i18n, t } = useTranslation('common');

  const handleLanguageChange = async (newLang) => {
    i18n.changeLanguage(newLang);
    localStorage.setItem('app_language', newLang);

    if (onLanguageChange) {
      onLanguageChange(newLang);
    }

    if (user) {
      try {
        await axios.patch('/profile/preferences', { preferredLocale: newLang });
      } catch (err) {
        console.warn('Failed to update language preference in profile:', err);
      }
    }
  };

  const currentLang = i18n.language || 'ru';

  return (
    <div className="inline-flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800/80 text-xs font-semibold shadow-inner">
      <button
        type="button"
        onClick={() => handleLanguageChange('ru')}
        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
          currentLang.startsWith('ru')
            ? 'bg-indigo-600 text-white shadow-sm font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Русский язык"
      >
        RU
      </button>
      <button
        type="button"
        onClick={() => handleLanguageChange('en')}
        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
          currentLang.startsWith('en')
            ? 'bg-indigo-600 text-white shadow-sm font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="English"
      >
        EN
      </button>
    </div>
  );
}
