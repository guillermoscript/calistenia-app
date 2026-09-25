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
    // #821: español SOLO si el idioma detectado es realmente español;
    // inglés para todo lo demás. `fallbackLng` es la red de seguridad para
    // cuando no hay NINGÚN candidato detectado (ver `convertDetectedLanguage`
    // más abajo, que ya deja resuelto el caso normal).
    fallbackLng: 'en',
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
      //
      // #821: además del saneo de formato, aquí se decide QUÉ idioma soporta
      // la app. Sin esto, un dispositivo en `pt-BR`/`de-DE` dejaría
      // `i18n.language` literalmente en `pt-BR` — los textos de i18next SÍ
      // caerían a inglés por `fallbackLng`, pero decenas de sitios leen
      // `i18n.language` EN CRUDO para decidir cosas que no pasan por `t()`:
      // `localize()` (`packages/core/lib/i18n-db.ts`, usado por
      // `usePrograms`/`useProgramEditor`/`useAutoProgression`…) hace
      // `field['pt-BR'] ?? field.es` y devolvería nombres de programa/
      // ejercicio en ESPAÑOL; varios sitios en `apps/web` hacen
      // `i18n.language === 'en' ? … : 'es-ES'` o `.startsWith('en') ? 'en' :
      // 'es'`, que con `pt-BR` caen también al lado español. Justo el caso
      // que motiva la issue (India, Alemania, Brasil, Indonesia…).
      //
      // Por eso se resuelve aquí, antes de que nada de eso se ejecute:
      // español SOLO si la etiqueta saneada empieza por "es" (conserva la
      // región — `es-MX`/`es-AR` siguen resolviendo a español vía el propio
      // matching de i18next contra el idioma base, sin necesitar
      // `fallbackLng`); cualquier otra cosa colapsa a `'en'` EXACTO, que ya
      // es un idioma cargado, así que `i18n.language`/`resolvedLanguage`
      // quedan en `'en'` de verdad — no solo el texto que renderiza `t()`.
      convertDetectedLanguage: (lng: string) => {
        const clean = safeLocale(lng)
        return clean.toLowerCase().startsWith('es') ? clean : 'en'
      },
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
