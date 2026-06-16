/**
 * OAuth Google en RN — flujo de código / deep-link (sin SSE realtime).
 *
 * Por qué NO el flujo realtime del SDK: ese espera el código OAuth por un socket
 * SSE de larga vida. Al abrir el navegador (Custom Tabs) la app pasa a background
 * y la gestión de batería agresiva de algunos OEM (Honor/MagicOS) congela ese
 * socket sin emitir error → el código nunca llega → login "Conectando..." para
 * siempre. Aquí el código vuelve por un deep-link de un solo uso, inmune al freeze.
 *
 * Flujo:
 *   1. core.loginWithOAuth2Code pide el authURL a PB (listAuthMethods) y le concatena
 *      OAUTH_BRIDGE_URL como redirect_uri.
 *   2. Abrimos ese authURL; Google redirige a OAUTH_BRIDGE_URL (página https en
 *      pb_public) que reenvía el code+state al esquema de la app (APP_RETURN_URL).
 *   3. openAuthSessionAsync resuelve con esa URL; parseamos code+state.
 *   4. core intercambia el código (authWithOAuth2Code) → token en pb.authStore.
 *
 * Setup externo necesario (ver runbook): registrar OAUTH_BRIDGE_URL en el cliente
 * OAuth de Google y servir oauth-bridge.html en pb_public.
 */
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { loginWithOAuth2Code } from '@calistenia/core/lib/pocketbase'

WebBrowser.maybeCompleteAuthSession()

// URL https que Google redirige tras el consentimiento. Debe estar en las
// "Authorized redirect URIs" del cliente OAuth de Google y servirse en pb_public.
// El bridge reenvía el code+state a APP_RETURN_URL.
const OAUTH_BRIDGE_URL =
  process.env.EXPO_PUBLIC_OAUTH_BRIDGE_URL || 'https://gym.guille.tech/oauth-bridge.html'

// Esquema propio de la app al que vuelve el deep-link. Literal (no Linking.createURL)
// para que coincida EXACTO con el redirect hardcodeado del bridge estático.
// expo-web-browser cierra el navegador al detectar esta URL. Requiere build
// standalone / dev-client (Expo Go usa otro esquema y no sirve para OAuth).
const APP_RETURN_URL = 'calistenia://oauthredirect'

/** El usuario cerró el navegador sin completar el login (no es un error a reportar). */
export class OAuthCancelledError extends Error {
  constructor(public readonly reason: string) {
    super(`oauth_cancelled_${reason}`)
    this.name = 'OAuthCancelledError'
  }
}

export const isAuthCancelled = (e: unknown): e is OAuthCancelledError =>
  e instanceof OAuthCancelledError

export async function loginWithGoogle() {
  return loginWithOAuth2Code('google', OAUTH_BRIDGE_URL, async (authUrl) => {
    const res = await WebBrowser.openAuthSessionAsync(authUrl, APP_RETURN_URL)
    if (res.type !== 'success' || !res.url) {
      throw new OAuthCancelledError(res.type)
    }
    const { queryParams } = Linking.parse(res.url)
    // Google devuelve ?error=access_denied si el usuario rechaza el consentimiento:
    // es una cancelación, no un fallo → no reportar a Sentry.
    if (queryParams?.error) {
      throw new OAuthCancelledError(String(queryParams.error))
    }
    return {
      code: String(queryParams?.code ?? ''),
      state: String(queryParams?.state ?? ''),
    }
  })
}
