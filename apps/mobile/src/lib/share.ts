import { Share } from 'react-native'
import * as Sharing from 'expo-sharing'

export const BASE_URL = 'https://gym.guille.tech'

// ── URL builders ──────────────────────────────────────────────────────────────

export function profileUrl(userId: string): string {
  return `${BASE_URL}/u/${userId}`
}

export function sessionUrl(date: string, workoutKey: string): string {
  return `${BASE_URL}/session/${date}/${workoutKey}`
}

export function raceUrl(id: string): string {
  return `${BASE_URL}/race/${id}`
}

export function inviteUrl(code: string): string {
  return `${BASE_URL}/invite/${code}`
}

/** Deep link to a single saved cardio session's detail page (web, universally openable). */
export function cardioUrl(id: string): string {
  return `${BASE_URL}/cardio/session/${id}`
}

// ── Primitive share helpers ───────────────────────────────────────────────────

export interface ShareTextOptions {
  message: string
  url?: string
}

/** Text-based share via RN native sheet. */
export async function shareText({ message, url }: ShareTextOptions): Promise<void> {
  const content = url ? `${message}\n${url}` : message
  await Share.share({ message: content })
}

/**
 * Image share via expo-sharing (opens native share sheet with file).
 * Falls back to Share.share (text only) when expo-sharing unavailable.
 */
export async function shareImage(
  uri: string,
  options?: { message?: string; title?: string },
): Promise<void> {
  const available = await Sharing.isAvailableAsync()
  if (available) {
    await Sharing.shareAsync(uri, {
      dialogTitle: options?.title ?? 'Compartir',
      mimeType: 'image/png',
      UTI: 'public.png',
    })
  } else {
    // Fallback: share the URL/message text only
    const msg = options?.message ?? uri
    await Share.share({ message: msg })
  }
}

// ── Message builders (Spanish, mirror web copy) ───────────────────────────────

export interface WorkoutSessionShareInput {
  userName: string
  workoutTitle: string
  totalSets: number
  durationMin: number
  date: string
  workoutKey: string
  referralCode?: string | null
}

export interface WorkoutSessionShareResult {
  message: string
  url: string
}

export function shareWorkoutSession(
  input: WorkoutSessionShareInput,
): WorkoutSessionShareResult {
  const { userName, workoutTitle, totalSets, durationMin, date, workoutKey, referralCode } = input
  const url = sessionUrl(date, workoutKey)
  let message = `${userName} completó "${workoutTitle}" — ${totalSets} series en ${durationMin} min 💪`
  if (referralCode) {
    message += `\n${inviteUrl(referralCode)}`
  }
  return { message, url }
}

export interface PRShareInput {
  exerciseName: string
  oldValue?: number | null
  newValue: number
  userName?: string
  referralCode?: string | null
}

export interface PRShareResult {
  message: string
  url: string
}

export function sharePR(input: PRShareInput): PRShareResult {
  const { exerciseName, oldValue, newValue, userName, referralCode } = input
  const from = oldValue ?? 0
  let message = `${userName ? `${userName}: ` : ''}${exerciseName}: ${from} → ${newValue} reps 🏆`
  if (referralCode) {
    message += `\n${inviteUrl(referralCode)}`
  }
  // PR events don't have a canonical deep-link; point to BASE_URL
  return { message, url: BASE_URL }
}

export interface CardioShareInput {
  userName?: string
  activityLabel: string
  distanceKm: number
  durationLabel: string
  sessionId?: string | null
  referralCode?: string | null
}

export interface CardioShareResult {
  message: string
  url: string
}

export function shareCardioSession(input: CardioShareInput): CardioShareResult {
  const { userName, activityLabel, distanceKm, durationLabel, sessionId, referralCode } = input
  const url = sessionId ? cardioUrl(sessionId) : BASE_URL
  let message = `${userName ? `${userName}: ` : ''}${activityLabel} — ${distanceKm.toFixed(2)} km en ${durationLabel} 🏃`
  if (referralCode) {
    message += `\n${inviteUrl(referralCode)}`
  }
  return { message, url }
}

export interface ReferralShareResult {
  message: string
  url: string
}

export function shareReferralInvite(
  displayName: string,
  referralCode: string,
): ReferralShareResult {
  const url = inviteUrl(referralCode)
  const message = `${displayName} te invita a entrenar en Calistenia App 🤸\nÚnete y empieza gratis:`
  return { message, url }
}
