/**
 * language-sync.ts
 *
 * Persiste el idioma de la app en `users.language` (#804).
 *
 * POR QUÉ IMPORTA: los push los manda el servidor (dispatchers del AI API y
 * hooks de PocketBase) y hasta ahora iban todos en español porque el servidor
 * no sabía en qué idioma usa cada uno la app. `mcp-server/src/api/push-sender.ts`
 * lee este campo para elegir la variante de cada push.
 *
 * A diferencia de `timezone-sync.ts`, aquí SÍ se sobrescribe lo guardado: el
 * idioma de la app es la única fuente de verdad y el usuario lo cambia a mano
 * desde la propia app. Lo que se guarda es lo que la app enseña de verdad
 * (#821: español solo si el idioma es español, inglés para todo lo demás), no
 * el idioma crudo del dispositivo.
 */
import i18n from 'i18next'
import { pb } from './pocketbase'

/** Idiomas que la app sabe enseñar (y, por tanto, que el servidor sabe mandar). */
export type UserLanguage = 'es' | 'en'

/**
 * Idioma soportado para una etiqueta de i18next. Misma regla que la detección
 * de web y móvil (#821): «es», «es-MX», «es-AR» → «es»; cualquier otra → «en».
 */
export function toUserLanguage(lng: string): UserLanguage {
  return lng.trim().toLowerCase().startsWith('es') ? 'es' : 'en'
}

/**
 * Escribe `users.language` si difiere de lo guardado.
 *
 * Fire-and-forget: nunca lanza.
 *
 * @returns el idioma efectivo, o null si no hay usuario/idioma o falló el guardado.
 */
export async function syncUserLanguage(
  userId: string,
  storedLanguage: string | null | undefined,
  currentLanguage: string | null | undefined,
): Promise<UserLanguage | null> {
  try {
    if (!userId || !currentLanguage) return null
    const language = toUserLanguage(currentLanguage)
    if (storedLanguage === language) return language
    // Actualizar el registro autenticado refresca también `pb.authStore`, así
    // que el `onChange` que dispara ve ya el idioma nuevo y no vuelve a escribir.
    await pb.collection('users').update(userId, { language })
    return language
  } catch {
    // Sin red / sin permisos: el próximo arranque, login o cambio de idioma lo
    // reintenta. Nunca romper nada por esto.
    return null
  }
}

let stop: (() => void) | null = null

/**
 * Mantiene `users.language` al día: sincroniza ya, en cada cambio de sesión
 * (login, OAuth, refresh) y en cada `languageChanged` de i18next. Llamar UNA vez,
 * después de inicializar i18next; las llamadas repetidas no hacen nada.
 *
 * Va aquí y no en `useAuth` porque en móvil `useAuth` solo se monta en la
 * pantalla de login (ver `apps/mobile/src/lib/init-core.ts`): con la sesión ya
 * iniciada nunca se ejecutaría.
 *
 * @returns función para dejar de escuchar (tests).
 */
export function startLanguageSync(): () => void {
  if (stop) return stop

  const sync = () => {
    const store = pb.authStore as unknown as {
      isValid: boolean
      record?: { id: string; language?: string } | null
      model?: { id: string; language?: string } | null
    }
    if (!store.isValid) return
    const user = store.record ?? store.model
    if (user?.id) void syncUserLanguage(user.id, user.language, i18n.language)
  }

  i18n.on('languageChanged', sync)
  const unsubscribeAuth = pb.authStore.onChange(sync)
  sync()

  stop = () => {
    i18n.off('languageChanged', sync)
    unsubscribeAuth()
    stop = null
  }
  return stop
}
