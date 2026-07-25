import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import Russian locales
import ruCommon from '../locales/ru/common.json';
import ruAuth from '../locales/ru/auth.json';
import ruDashboard from '../locales/ru/dashboard.json';
import ruBanks from '../locales/ru/banks.json';
import ruDeposits from '../locales/ru/deposits.json';
import ruFamily from '../locales/ru/family.json';
import ruAudit from '../locales/ru/audit.json';
import ruHelp from '../locales/ru/help.json';
import ruTooltips from '../locales/ru/tooltips.json';
import ruErrors from '../locales/ru/errors.json';

// Import English locales
import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
import enDashboard from '../locales/en/dashboard.json';
import enBanks from '../locales/en/banks.json';
import enDeposits from '../locales/en/deposits.json';
import enFamily from '../locales/en/family.json';
import enAudit from '../locales/en/audit.json';
import enHelp from '../locales/en/help.json';
import enTooltips from '../locales/en/tooltips.json';
import enErrors from '../locales/en/errors.json';

const resources = {
  ru: {
    common: ruCommon,
    auth: ruAuth,
    dashboard: ruDashboard,
    banks: ruBanks,
    deposits: ruDeposits,
    family: ruFamily,
    audit: ruAudit,
    help: ruHelp,
    tooltips: ruTooltips,
    errors: ruErrors
  },
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    banks: enBanks,
    deposits: enDeposits,
    family: enFamily,
    audit: enAudit,
    help: enHelp,
    tooltips: enTooltips,
    errors: enErrors
  }
};

const rtlLanguages = [];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ru',
    supportedLngs: ['ru', 'en'],
    defaultNS: 'common',
    fallbackNS: 'common',
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'app_language'
    }
  });

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
    document.documentElement.dir = rtlLanguages.includes(lng) ? 'rtl' : 'ltr';
  }
});

export default i18n;
