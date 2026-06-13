/**
 * OAuth Google en RN (spike fase 1).
 *
 * El SDK de PocketBase completa authWithOAuth2 via realtime (SSE, ver polyfill
 * en init-core); nosotros solo abrimos la URL del provider en un auth session.
 * Requiere en PB: provider google activo. El redirect va al propio servidor PB
 * (/api/oauth2-redirect), no hace falta registrar el deep link en Google.
 */
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { loginWithOAuth2 } from '@calistenia/core/lib/pocketbase'

WebBrowser.maybeCompleteAuthSession()

export async function loginWithGoogle() {
  return loginWithOAuth2('google', async (url) => {
    await WebBrowser.openAuthSessionAsync(url, Linking.createURL('/'))
  })
}
