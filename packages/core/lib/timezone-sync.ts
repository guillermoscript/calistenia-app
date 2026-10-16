/**
 * timezone-sync.ts
 *
 * La zona horaria de la app es SIEMPRE la del dispositivo, y se refleja en
 * `users.timezone` para que el servidor la use.
 *
 * POR QUÉ: antes, una zona ya guardada en `users.timezone` ganaba a la del
 * dispositivo para siempre. Quien la tenía fijada en `Europe/Madrid` y estaba
 * en Nueva York veía «hoy» pasar a mañana a las 18:00 de su hora (medianoche en
 * Madrid): el día, la semana, la racha y el agua se calculaban con la hora de
 * otra zona. Lo que el usuario ve en su reloj es lo que manda.
 *
 * El servidor (`mcp-server/src/api/reminder-dispatcher.ts` y demás
 * dispatchers) convierte la hora de pared de los recordatorios con ESE campo,
 * así que se mantiene al día: si la zona del dispositivo cambia (viaje, cambio
 * de zona del sistema), se reescribe.
 *
 * Se llama al arrancar y en cada cambio de sesión (ver `useAuth` e `init-core`).
 */
import { pb } from './pocketbase'
import { getTimezone, setTimezone } from './dateUtils'

/** Zona IANA del dispositivo (sin sanear: `setTimezone` cae a UTC si es inválida). */
export function detectDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Fija la zona de la app a la del dispositivo y, si `users.timezone` no
 * coincide, la actualiza.
 *
 * Si el dispositivo no da una zona válida (Android puede devolver
 * "Etc/Unknown" → `setTimezone` la deja en UTC) se usa la guardada, que es
 * mejor dato que UTC, y no se toca el registro.
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

    const raw = detectDeviceTimezone()
    setTimezone(raw)
    const deviceTz = getTimezone()

    // Zona del dispositivo inválida (saneada a UTC sin que el dispositivo
    // dijera UTC): mejor la guardada que UTC, y el registro no se toca.
    if (deviceTz === 'UTC' && raw !== 'UTC' && storedTimezone) {
      setTimezone(storedTimezone)
      return getTimezone()
    }

    if (storedTimezone !== deviceTz) {
      await pb.collection('users').update(userId, { timezone: deviceTz })
    }
    return deviceTz
  } catch {
    // Sin red / sin permisos: la zona en memoria ya quedó fijada y el próximo
    // arranque lo reintenta. Nunca bloquear el login por esto.
    return null
  }
}
