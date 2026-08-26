/**
 * i18next initialization.
 * Import this module for its side-effect (calls i18next.init).
 * Translations are bundled — no HTTP fetch needed.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { safeLocale } from '@calistenia/core/lib/i18n-safe'

import es from '@calistenia/core/locales/es/translation.json'
import en from '@calistenia/core/locales/en/translation.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    fallbackLng: 'es',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      // `navigator.language` no siempre es BCP-47: iOS en modo POSIX devuelve
      // `en-US@posix`. i18next propaga tal cual lo detectado a `i18n.language`,
      // y la app lo pasa a `toLocaleDateString(locale)` / `Intl.DateTimeFormat`
      // en ~25 sitios; ahí lanza `RangeError: Invalid language tag` y se lleva
      // por delante el árbol de React hasta el ErrorBoundary (GYM-GUILLE-21).
      //
      // Saneándolo AQUÍ se arreglan los ~25 de una vez, porque todos leen
      // `i18n.language`. El detector aplica esto a TODO lo detectado, así que
      // también limpia un `i18nextLng` envenenado ya guardado en localStorage.
      convertDetectedLanguage: (lng: string) => safeLocale(lng),
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
