/**
 * Sentry para React Native. DEBE importarse antes que init-core (mismo orden
 * que web: instrument.ts → init-core.ts). En dev queda deshabilitado (Expo Go
 * solo soporta el modo JS-only y no queremos ruido de desarrollo).
 */
import * as Sentry from '@sentry/react-native'

Sentry.init({
  // Mismo proyecto Sentry que la web; los eventos llegan etiquetados como
  // react-native. Si se crea un proyecto propio, basta con cambiar el DSN.
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ||
    'https://45325daff5446587024f972577dbbb70@o4507789962706944.ingest.us.sentry.io/4511134403723264',
  enabled: !__DEV__,
  environment: __DEV__ ? 'development' : 'production',
  sendDefaultPii: true,
  tracesSampleRate: 0.2,
})

export { Sentry }
