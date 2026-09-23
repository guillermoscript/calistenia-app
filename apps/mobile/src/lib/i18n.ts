/**
 * i18next para RN: mismos JSON que web (core/locales), idioma del dispositivo
 * via expo-localization, override del usuario persistido en storage.
 *
 * A diferencia de web (side-effect import), aquí es una función: hay que
 * llamarla DESPUÉS de hydrateStorage() para poder leer el override guardado.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import { storage } from '@calistenia/core/platform'
import { resolveInitialLanguage } from './language-resolver'

import es from '@calistenia/core/locales/es/translation.json'
import en from '@calistenia/core/locales/en/translation.json'

const LANG_KEY = 'i18nextLng'

export function initI18n(): void {
  if (i18n.isInitialized) return

  const saved = storage.getItem(LANG_KEY)
  const deviceLang = getLocales()[0]?.languageCode
  // #821: español SOLO si el dispositivo es realmente español; inglés para
  // todo lo demás (India, Alemania, Brasil, Indonesia… ven hoy la app en
  // español sin hablarlo). El guardado sigue ganando siempre — ver
  // `resolveInitialLanguage`.
  const lng = resolveInitialLanguage(deviceLang, saved)

  i18n.use(initReactI18next).init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

  i18n.on('languageChanged', (next) => storage.setItem(LANG_KEY, next))
}

export default i18n
