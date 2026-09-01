/**
 * Sentry para React Native. DEBE importarse antes que init-core (mismo orden
 * que web: instrument.ts → init-core.ts). En dev queda deshabilitado (Expo Go
 * solo soporta el modo JS-only y no queremos ruido de desarrollo).
 */
import * as Sentry from '@sentry/react-native'

Sentry.init({
  // Proyecto Sentry propio de RN (guillermoscript/calistenia-app), distinto del
  // de la web. Override por env para builds que quieran apuntar a otro entorno.
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ||
    'https://fb6f769a50d854890fb9a705b96ea4b2@o4507789962706944.ingest.us.sentry.io/4511572569161728',
  enabled: !__DEV__,
  environment: __DEV__ ? 'development' : 'production',
  sendDefaultPii: false,
  tracesSampleRate: 0.2,
  // Ruido conocido que no es accionable desde la app:
  ignoreErrors: [
    // Red del usuario, no bugs nuestros — fetch abortado al ir la app a
    // background y DNS sin resolver por estar offline (CALISTENIA-APP-2/8).
    'Fetch request has been canceled',
    'Unable to resolve host',
    // El install referrer de Play lo consulta una dependencia (atribución) y
    // falla en dispositivos sin Play Store o con versiones viejas
    // (CALISTENIA-APP-X/M/A/R). No hay nada que arreglar en nuestro código.
    /install(ation)? referrer/i,
  ],
})

export { Sentry }
