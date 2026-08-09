import { Linking, Platform, Share, type ShareAction } from 'react-native'
import * as Sharing from 'expo-sharing'
import * as Clipboard from 'expo-clipboard'
import { trackShareCardShared } from '@calistenia/core/lib/analytics'

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

export type NativeShareOutcome =
  | { result: 'shared'; confirmed: true }
  | { result: 'opened'; confirmed: false }
  | { result: 'dismissed'; confirmed: false }

export interface MobileShareCardProperties {
  surface: string
  source?: string
  share_type: string
  workout_id?: string
  [key: string]: unknown
}

export const MOBILE_SHARE_CARD_CONTEXTS = {
  workoutCompletion: {
    surface: 'post_workout', source: 'workout_completion', share_type: 'workout', card_type: 'workout',
  },
  workoutHistory: {
    surface: 'session_detail', source: 'history', share_type: 'workout', card_type: 'workout',
  },
  personalRecord: {
    surface: 'pr_celebration', source: 'pr_achieved', share_type: 'pr', card_type: 'pr',
  },
  streak: {
    surface: 'streak_milestone', source: 'streak_achieved', share_type: 'streak', card_type: 'streak',
  },
  cardio: {
    surface: 'cardio', source: 'cardio_completion', share_type: 'cardio', card_type: 'cardio',
  },
  nutrition: {
    surface: 'nutrition', source: 'daily_summary', share_type: 'nutrition', card_type: 'nutrition',
  },
  progressPhoto: {
    surface: 'progress', source: 'progress_photo', share_type: 'progress_photo', card_type: 'progress_photo',
  },
} as const satisfies Record<string, MobileShareCardProperties>

export function classifyNativeShareAction(action: ShareAction['action']): NativeShareOutcome {
  if (action === Share.dismissedAction) {
    return { result: 'dismissed', confirmed: false }
  }
  if (action === Share.sharedAction && Platform.OS === 'ios') {
    return { result: 'shared', confirmed: true }
  }
  return { result: 'opened', confirmed: false }
}

/** Text-based share via RN native sheet. */
export async function shareText({ message, url }: ShareTextOptions): Promise<NativeShareOutcome> {
  const content = url ? `${message}\n${url}` : message
  const result = await Share.share({ message: content })
  return classifyNativeShareAction(result.action)
}

/**
 * Image share via expo-sharing (opens native share sheet with file).
 * Falls back to Share.share (text only) when expo-sharing unavailable.
 */
export async function shareImage(
  uri: string,
  options?: { message?: string; title?: string },
): Promise<NativeShareOutcome> {
  const available = await Sharing.isAvailableAsync()
  if (available) {
    await Sharing.shareAsync(uri, {
      dialogTitle: options?.title ?? 'Compartir',
      mimeType: 'image/png',
      UTI: 'public.png',
    })
    // expo-sharing no expone éxito/cancelación: solo sabemos que abrió y cerró.
    return { result: 'opened', confirmed: false }
  } else {
    // Fallback: share the URL/message text only
    const msg = options?.message ?? uri
    return shareText({ message: msg })
  }
}

/** Comparte una tarjeta y registra como máximo un evento por invocación. */
export async function shareCardImage(
  uri: string,
  options: { message?: string; title?: string } | undefined,
  properties: MobileShareCardProperties,
): Promise<NativeShareOutcome> {
  const outcome = await shareImage(uri, options)
  if (outcome.result !== 'dismissed') {
    trackShareCardShared({
      ...properties,
      platform: Platform.OS,
      result: outcome.result,
      share_confirmed: outcome.confirmed,
    })
  }
  return outcome
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

export type ReferralShareChannel = 'native' | 'copy' | 'whatsapp'

export function shareReferralInvite(
  displayName: string,
  referralCode: string,
): ReferralShareResult {
  const url = inviteUrl(referralCode)
  const message = `${displayName} te invita a entrenar en Calistenia App 🤸\nÚnete y empieza gratis:`
  return { message, url }
}

export async function shareReferralInviteByChannel(
  displayName: string,
  referralCode: string,
  channel: ReferralShareChannel,
): Promise<boolean> {
  const { message, url } = shareReferralInvite(displayName, referralCode)
  const content = `${message}\n${url}`

  if (channel === 'copy') {
    await Clipboard.setStringAsync(url)
    return true
  }

  if (channel === 'whatsapp') {
    await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(content)}`)
    return true
  }

  const result = await Share.share({ message: content })
  return result.action === Share.sharedAction
}

/** Deep link to the web nutrition page for a specific date. */
export function nutritionUrl(date: string): string {
  return `${BASE_URL}/nutrition?date=${date}`
}

export interface NutritionDayShareInput {
  userName?: string
  date: string
  calories: number
  goalCalories?: number
  qualityScore?: string
  referralCode?: string | null
}

export interface NutritionDayShareResult {
  message: string
  url: string
}

export function shareNutritionDay(input: NutritionDayShareInput): NutritionDayShareResult {
  const { userName, date, calories, goalCalories, qualityScore, referralCode } = input
  const url = referralCode ? inviteUrl(referralCode) : nutritionUrl(date)
  let message = `${userName ? `${userName} · ` : ''}Mi nutrición del ${date}: ${calories} kcal`
  if (goalCalories) {
    message += ` / ${goalCalories}`
  }
  if (qualityScore) {
    message += ` · Calidad ${qualityScore}`
  }
  return { message, url }
}
