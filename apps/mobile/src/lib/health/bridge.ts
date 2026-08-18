/**
 * Health Connect bridge (Android) — thin, normalized wrapper over
 * `react-native-health-connect`.
 *
 * RN-only: this file imports the native module, so it lives in apps/mobile and
 * is NEVER imported by packages/core (which the web app bundles). All calls are
 * guarded by Platform.OS — on iOS/web every method resolves to an
 * "unsupported" no-op (iOS HealthKit is Phase 2, behind the same shape).
 *
 * Phase 1 = READ ONLY. No write/share permissions are requested.
 */
import { Platform } from 'react-native'
import { Sentry } from '@/lib/instrument'
import {
  initialize,
  getSdkStatus,
  SdkAvailabilityStatus,
  requestPermission,
  getGrantedPermissions,
  readRecords,
  openHealthConnectSettings,
  type Permission,
} from 'react-native-health-connect'
import type { HealthHubStatus } from '@calistenia/core/types'

/** Record types we read (Fase 1). Mirrors the READ_* perms in app.json. */
const READ_RECORD_TYPES = [
  'Steps',
  'SleepSession',
  'HeartRate',
  'RestingHeartRate',
  'HeartRateVariabilityRmssd',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'Weight',
  'BodyFat',
  'Vo2Max',
  'Distance',
  'ExerciseSession',
] as const

const READ_PERMISSIONS: Permission[] = READ_RECORD_TYPES.map((recordType) => ({
  accessType: 'read',
  recordType,
})) as Permission[]

export interface TimeRange {
  /** ISO datetime */
  startTime: string
  /** ISO datetime */
  endTime: string
}

const isAndroid = Platform.OS === 'android'

/** True only on a platform with a Health Connect provider. */
export function isSupported(): boolean {
  return isAndroid
}

let initialized = false
async function ensureInitialized(): Promise<boolean> {
  if (!isAndroid) return false
  if (initialized) return true
  initialized = await initialize()
  return initialized
}

/** Availability of the Health Connect provider on this device. */
export async function getStatus(): Promise<HealthHubStatus> {
  if (!isAndroid) return 'unsupported'
  try {
    const status = await getSdkStatus()
    switch (status) {
      case SdkAvailabilityStatus.SDK_AVAILABLE:
        return 'available'
      case SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED:
        return 'update_required'
      default:
        return 'unavailable'
    }
  } catch {
    return 'unavailable'
  }
}

/**
 * Request all read permissions. Opens the Health Connect system permission
 * screen. Returns the list of granted permissions (empty if the user denied).
 * NB: declining twice permanently blocks the dialog — callers should fall back
 * to {@link openSettings}.
 */
export async function requestPermissions() {
  if (!(await ensureInitialized())) return []
  return requestPermission(READ_PERMISSIONS)
}

/** Permissions already granted (no UI). */
export async function getGranted() {
  if (!(await ensureInitialized())) return []
  return getGrantedPermissions()
}

/** Whether the app currently holds at least one read permission. */
export async function isConnected(): Promise<boolean> {
  const granted = await getGranted()
  return granted.length > 0
}

/** Deep-link to the Health Connect settings/permissions screen. */
export async function openSettings(): Promise<void> {
  if (!isAndroid) return
  try {
    await openHealthConnectSettings()
  } catch {
    /* ignore */
  }
}

// ─── Normalized reads ────────────────────────────────────────────────────────
// Each returns a flat, platform-neutral shape the sync layer can aggregate.

function filter(range: TimeRange) {
  return {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: range.startTime,
      endTime: range.endTime,
    },
  }
}

async function read<T>(recordType: (typeof READ_RECORD_TYPES)[number], range: TimeRange): Promise<T[]> {
  if (!(await ensureInitialized())) return []
  try {
    // recordType is a union; the lib's readRecords overloads are keyed by the
    // exact literal, so cast to satisfy overload resolution.
    const { records } = await readRecords(recordType as never, filter(range))
    return records as unknown as T[]
  } catch (e) {
    Sentry.captureException(e, { tags: { feature: 'health', op: 'read_health_records' } })
    return []
  }
}

// ─── Formas crudas de Health Connect ─────────────────────────────────────────
// `readRecords` está sobrecargado por literal de tipo y sus tipos no se dejan
// resolver a través del wrapper genérico `read<T>`, así que declaramos aquí la
// parte de cada registro que consumimos. Es lo que antes se tapaba con `any`.

interface RawMetadata { id?: string }
interface RawInstant { time: string; metadata?: RawMetadata }
interface RawInterval { startTime: string; endTime: string; metadata?: RawMetadata }
interface RawEnergy { inKilocalories?: number }
interface RawMass { inKilograms?: number }

interface RawSteps extends RawInterval { count?: number }
interface RawSleepStage { stage: number; startTime: string; endTime: string }
interface RawSleepSession extends RawInterval { stages?: RawSleepStage[] }
interface RawHeartRateSample { time: string; beatsPerMinute: number }
interface RawHeartRate extends RawInterval { samples?: RawHeartRateSample[] }
interface RawRestingHeartRate extends RawInstant { beatsPerMinute: number }
interface RawHrv extends RawInstant { heartRateVariabilityMillis: number }
interface RawVo2Max extends RawInstant { vo2MillilitersPerMinuteKilogram: number }
interface RawCalories extends RawInterval { energy?: RawEnergy }
interface RawWeight extends RawInstant { weight?: RawMass }
interface RawBodyFat extends RawInstant { percentage?: number }

export interface StepsSample { startTime: string; endTime: string; count: number }
export async function readSteps(range: TimeRange): Promise<StepsSample[]> {
  const recs = await read<RawSteps>('Steps', range)
  return recs.map((r) => ({ startTime: r.startTime, endTime: r.endTime, count: r.count ?? 0 }))
}

export interface SleepSample { startTime: string; endTime: string; awakeMinutes: number; id?: string }
export async function readSleep(range: TimeRange): Promise<SleepSample[]> {
  const recs = await read<RawSleepSession>('SleepSession', range)
  return recs.map((r) => {
    // stage === 1 is AWAKE in the Health Connect enum
    const awakeMinutes = (r.stages ?? [])
      .filter((s) => s.stage === 1)
      .reduce((sum: number, s) => sum + minutesBetween(s.startTime, s.endTime), 0)
    return { startTime: r.startTime, endTime: r.endTime, awakeMinutes, id: r.metadata?.id }
  })
}

export interface HrSample { time: string; bpm: number }
export async function readHeartRate(range: TimeRange): Promise<HrSample[]> {
  const recs = await read<RawHeartRate>('HeartRate', range)
  return recs.flatMap((r) =>
    (r.samples ?? []).map((s) => ({ time: s.time, bpm: s.beatsPerMinute })),
  )
}

export async function readRestingHeartRate(range: TimeRange): Promise<HrSample[]> {
  const recs = await read<RawRestingHeartRate>('RestingHeartRate', range)
  return recs.map((r) => ({ time: r.time, bpm: r.beatsPerMinute }))
}

export interface ValueSample { time: string; value: number }
export async function readHrv(range: TimeRange): Promise<ValueSample[]> {
  const recs = await read<RawHrv>('HeartRateVariabilityRmssd', range)
  return recs.map((r) => ({ time: r.time, value: r.heartRateVariabilityMillis }))
}

export async function readVo2Max(range: TimeRange): Promise<ValueSample[]> {
  const recs = await read<RawVo2Max>('Vo2Max', range)
  return recs.map((r) => ({ time: r.time, value: r.vo2MillilitersPerMinuteKilogram }))
}

export interface EnergySample { startTime: string; endTime: string; kcal: number }
export async function readActiveCalories(range: TimeRange): Promise<EnergySample[]> {
  const recs = await read<RawCalories>('ActiveCaloriesBurned', range)
  return recs.map((r) => ({ startTime: r.startTime, endTime: r.endTime, kcal: r.energy?.inKilocalories ?? 0 }))
}

export async function readTotalCalories(range: TimeRange): Promise<EnergySample[]> {
  const recs = await read<RawCalories>('TotalCaloriesBurned', range)
  return recs.map((r) => ({ startTime: r.startTime, endTime: r.endTime, kcal: r.energy?.inKilocalories ?? 0 }))
}

export interface WeightSample { time: string; kg: number; id?: string }
export async function readWeight(range: TimeRange): Promise<WeightSample[]> {
  const recs = await read<RawWeight>('Weight', range)
  return recs.map((r) => ({ time: r.time, kg: r.weight?.inKilograms ?? 0, id: r.metadata?.id }))
}

export interface BodyFatSample { time: string; pct: number; id?: string }
export async function readBodyFat(range: TimeRange): Promise<BodyFatSample[]> {
  const recs = await read<RawBodyFat>('BodyFat', range)
  return recs.map((r) => ({ time: r.time, pct: r.percentage ?? 0, id: r.metadata?.id }))
}

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}
