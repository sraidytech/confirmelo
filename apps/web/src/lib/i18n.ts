import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enAuth from '../locales/en/auth.json';
import frAuth from '../locales/fr/auth.json';
import enCommon from '../locales/en/common.json';
import frCommon from '../locales/fr/common.json';

const resources = {
  en: {
    auth: enAuth,
    common: enCommon,
  },
  fr: {
    auth: frAuth,
    common: frCommon,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    
    // Language detection options
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'language',
    },

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    // Development options
    debug: process.env.NODE_ENV === 'development',
    
    // Namespace separation
    keySeparator: '.',
    nsSeparator: ':',
  });

export default i18n;