/**
 * timezone-sync.ts
 *
 * Persiste la zona horaria del dispositivo en `users.timezone`.
 *
 * POR QUÉ IMPORTA: los recordatorios los envía el servidor
 * (`mcp-server/src/api/reminder-dispatcher.ts`), que convierte `hour`/`minute`
 * —hora de pared del usuario— usando ESE campo. Hasta ahora solo lo escribía el
 * selector de la página de perfil de la web, así que la inmensa mayoría de las
 * cuentas lo tenían vacío: el dispatcher caería a UTC y volvería a mandar los
 * recordatorios a la hora equivocada, justo el bug que se está arreglando.
 *
 * Se llama al arrancar y en cada cambio de sesión (ver `useAuth`), de modo que
 * también sigue al usuario cuando viaja o cambia la zona del sistema.
 */
import { pb } from './pocketbase'
import { getTimezone, setTimezone } from './dateUtils'

/** Zona IANA del dispositivo, saneada (Android puede devolver "Etc/Unknown"). */
function detectDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Rellena `users.timezone` con la zona del dispositivo **solo si está vacía**.
 *
 * NO sobrescribe una zona ya guardada: el selector del perfil web deja elegirla
 * a mano y machacarla en cada login sería perder una decisión explícita del
 * usuario (p. ej. quien viaja y quiere seguir recibiendo los recordatorios en
 * la hora de casa). Para cambiarla se usa el perfil.
 *
 * Fire-and-forget: nunca lanza.
 *
 * @returns la zona efectiva, o null si no se pudo determinar/guardar.
 */
export async function syncUserTimezone(
  userId: string,
  storedTimezone?: string | null,
): Promise<string | null> {
  try {
    if (!userId) return null

    // Ya hay una zona elegida/guardada → respetarla.
    if (storedTimezone) {
      setTimezone(storedTimezone)
      return storedTimezone
    }

    // `setTimezone` sanea (Android puede devolver "Etc/Unknown" → UTC).
    setTimezone(detectDeviceTimezone())
    const deviceTz = getTimezone()

    await pb.collection('users').update(userId, { timezone: deviceTz })
    return deviceTz
  } catch {
    // Sin red / sin permisos: la zona en memoria ya quedó fijada y el próximo
    // arranque lo reintenta. Nunca bloquear el login por esto.
    return null
  }
}
