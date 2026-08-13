import { storage } from '../platform'

const REFERRAL_PROMPT_KEY = 'calistenia_referral_prompt_shown'
const REFERRAL_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000

const promptedThisSession = new Set<string>()

export interface ReferralPromptEligibility {
  userId: string | null | undefined
  referralCode: string | null | undefined
  totalSessions: number
  now?: number
}

function storageKey(userId: string): string {
  return `${REFERRAL_PROMPT_KEY}_${userId}`
}

export function isReferralPromptOnCooldown(userId: string, now = Date.now()): boolean {
  const stored = storage.getItem(storageKey(userId))
  if (!stored || stored === 'true') return false

  const handledAt = new Date(stored).getTime()
  if (!Number.isFinite(handledAt)) return false

  return now - handledAt < REFERRAL_COOLDOWN_MS
}

export function shouldShowReferralPrompt({
  userId,
  referralCode,
  totalSessions,
  now = Date.now(),
}: ReferralPromptEligibility): boolean {
  if (!userId || !referralCode || totalSessions < 3) return false
  if (promptedThisSession.has(userId)) return false
  return !isReferralPromptOnCooldown(userId, now)
}

/** Prevents another prompt during the same app process, including remounted workouts. */
export function markReferralPromptViewed(userId: string): void {
  promptedThisSession.add(userId)
}

/** Dismissal and completed invite actions share the same persisted cooldown. */
export function markReferralPromptHandled(userId: string, now = Date.now()): void {
  promptedThisSession.add(userId)
  storage.setItem(storageKey(userId), new Date(now).toISOString())
}

/** Test-only reset for process-local suppression. */
export function resetReferralPromptSession(): void {
  promptedThisSession.clear()
}
