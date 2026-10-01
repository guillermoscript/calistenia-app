/**
 * «Entrena con alguien» (#803): el invitado aterriza en el mismo programa que
 * quien le invitó.
 *
 * Tras el registro (`completeNewUserRegistration`) se resuelve el programa
 * actual del referrer y se deja aquí. El onboarding lo lee UNA vez y lo
 * preselecciona en el paso de programa (editable, no forzado).
 */
import { storage } from '../platform'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from './analytics'

/** Un solo uso y ligado al usuario: se limpia al cerrar sesión (storage-keys). */
export const INVITED_PROGRAM_KEY = 'calistenia_invited_program'

/** Si el onboarding no lo consumió en unas horas, ya no es la intención del alta. */
const INVITED_PROGRAM_TTL_MS = 24 * 60 * 60 * 1000

export interface InvitedProgram {
  userId: string
  referrerId: string
  programId: string
  createdAt: number
}

export function saveInvitedProgram(userId: string, referrerId: string, programId: string, now = Date.now()): void {
  const value: InvitedProgram = { userId, referrerId, programId, createdAt: now }
  storage.setItem(INVITED_PROGRAM_KEY, JSON.stringify(value))
}

/** Lee y borra. `null` si no hay, es de otro usuario o caducó. */
export function takeInvitedProgram(userId: string | null | undefined, now = Date.now()): InvitedProgram | null {
  if (!userId) return null
  const raw = storage.getItem(INVITED_PROGRAM_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<InvitedProgram>
    if (parsed.userId !== userId) return null
    storage.removeItem(INVITED_PROGRAM_KEY)
    if (typeof parsed.createdAt !== 'number' || now - parsed.createdAt > INVITED_PROGRAM_TTL_MS) return null
    if (!parsed.programId || !parsed.referrerId) return null
    return { userId, referrerId: parsed.referrerId, programId: parsed.programId, createdAt: parsed.createdAt }
  } catch {
    storage.removeItem(INVITED_PROGRAM_KEY)
    return null
  }
}

/**
 * Decide qué programa preseleccionar: el del referrer solo si el invitado
 * puede verlo en su catálogo (un programa privado del referrer no aparece).
 */
export function pickInvitedProgramId(
  invited: Pick<InvitedProgram, 'programId'> | null,
  programs: ReadonlyArray<{ id: string }>,
): string | null {
  if (!invited) return null
  return programs.some(p => p.id === invited.programId) ? invited.programId : null
}

export function trackReferralProgramMatched(props: {
  referrerId: string
  programId: string | null
  matched: boolean
  stage: 'registration' | 'onboarding'
}): void {
  trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.referralProgramMatched, {
    surface: 'referral',
    source: 'quick_invite',
    result: props.matched ? 'matched' : 'unmatched',
    referrer_id: props.referrerId,
    program_id: props.programId ?? undefined,
    matched: props.matched,
    stage: props.stage,
  })
}
