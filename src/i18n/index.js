import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ar from './locales/ar.json';

// English is the default for everyone. Arabic only when the person picks it (the choice is kept).
// One-time reset: earlier builds stored Arabic automatically, before anyone chose it.
try {
  if (!localStorage.getItem('agro_lang_default_v2')) {
    localStorage.setItem('i18nextLng', 'en');
    localStorage.setItem('agro_lang_default_v2', '1');
  }
} catch { /* storage blocked: the detector falls back to English */ }

const resources = {
  en: { translation: en },
  ar: { translation: ar },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    debug: process.env.NODE_ENV === 'development',
    
    interpolation: {
      escapeValue: false, // React already escapes
    },

    detection: {
      // Only the person's own choice; never the browser's language.
      order: ['localStorage'],
      caches: ['localStorage'],
    },
  });

// Helper to check if current language is RTL
export const isRTL = () => {
  return i18n.language === 'ar';
};

// Helper to get current direction
export const getDirection = () => {
  return isRTL() ? 'rtl' : 'ltr';
};

export default i18n;
