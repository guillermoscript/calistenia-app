/**
 * Estado del objetivo «3 entrenos en tus primeros 7 días» para la tarjeta del
 * inicio (#800), en web y móvil. La lógica vive en `lib/activation.ts`; aquí
 * solo se pone el «hoy» y el día local del alta.
 */
import { useEffect, useMemo } from 'react'
import { todayStr, utcToLocalDateStr } from '../lib/dateUtils'
import { getAnalyticsProgramId } from '../lib/analytics'
import {
  activationCardMode,
  deriveActivation,
  trackActivationReached,
  type ActivationCardMode,
  type ActivationState,
} from '../lib/activation'

export interface ActivationView extends ActivationState {
  mode: ActivationCardMode
}

/**
 * @param created  `users.created` del registro de auth (UTC de PocketBase).
 * @param doneDates días con sesión completada ('YYYY-MM-DD'), `getDoneDates()`.
 */
export function useActivation(created: string | null | undefined, doneDates: readonly string[]): ActivationView {
  const today = todayStr()
  // PB manda «2026-09-20 10:00:00.000Z»: con el espacio dayjs cae a `new Date`,
  // que Hermes no sabe leer.
  const signupDay = created ? utcToLocalDateStr(created.replace(' ', 'T')) || null : null
  return useMemo(() => {
    const state = deriveActivation({ sessionDays: doneDates, signupDay, today })
    return { ...state, mode: activationCardMode(state, today) }
  }, [doneDates, signupDay, today])
}

/** Emite `activation_reached` (una vez por usuario y dispositivo) en cuanto el estado lo diga. */
export function useTrackActivationReached(userId: string | null | undefined, state: ActivationState): void {
  useEffect(() => {
    trackActivationReached(userId, state, getAnalyticsProgramId())
  }, [userId, state])
}
