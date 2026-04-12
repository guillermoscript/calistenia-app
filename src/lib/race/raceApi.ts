import { pb } from '../pocketbase'
import { serverNow } from './raceClock'
import { wrapPbError, RaceNotFoundError } from './errors'
import type {
  Race,
  RaceParticipant,
  RaceMode,
  RaceActivityType,
  RaceGpsPoint,
} from '../../types/race'

const RACE_COUNTDOWN_MS = 7000
const RACE_WINDOW_HOURS = 3

export interface CreateRaceInput {
  name: string
  mode: RaceMode
  activity_type: RaceActivityType
  target_distance_km?: number
  target_duration_seconds?: number
  route_points?: Array<{ lat: number; lng: number }>
  is_public?: boolean
  origin_lat?: number
  origin_lng?: number
}

export async function createRace(input: CreateRaceInput): Promise<Race> {
  const userId = pb.authStore.record?.id
  if (!userId) throw wrapPbError({ status: 401, message: 'Not authenticated' })
  try {
    return await pb.collection('races').create<Race>({
      creator: userId,
      name: input.name,
      mode: input.mode,
      activity_type: input.activity_type,
      target_distance_km: input.mode === 'distance' ? (input.target_distance_km ?? 0) : 0,
      target_duration_seconds: input.mode === 'time' ? (input.target_duration_seconds ?? 0) : 0,
      status: 'waiting',
      route_points: input.route_points && input.route_points.length > 0 ? input.route_points : null,
      is_public: input.is_public ?? false,
      origin_lat: input.origin_lat ?? 0,
      origin_lng: input.origin_lng ?? 0,
    })
  } catch (e) {
    throw wrapPbError(e)
  }
}

export async function loadRace(raceId: string): Promise<{ race: Race; participants: RaceParticipant[] }> {
  try {
    const [race, participants] = await Promise.all([
      pb.collection('races').getOne<Race>(raceId, { requestKey: null }),
      pb.collection('race_participants').getFullList<RaceParticipant>({
        filter: `race = "${raceId}"`,
        sort: '-distance_km',
        requestKey: null,
      }),
    ])
    return { race, participants }
  } catch (e) {
    const err = e as { status?: number }
    if (err?.status === 404) throw new RaceNotFoundError()
    throw wrapPbError(e)
  }
}

/**
 * Idempotent join. If a row already exists for (race, user), return it.
 * The DB-level UNIQUE INDEX makes concurrent joins safe.
 */
export async function joinRace(raceId: string, displayName: string): Promise<RaceParticipant> {
  const userId = pb.authStore.record?.id
  if (!userId) throw wrapPbError({ status: 401, message: 'Not authenticated' })
  try {
    const existing = await pb.collection('race_participants').getFirstListItem<RaceParticipant>(
      `race = "${raceId}" && user = "${userId}"`,
      { requestKey: null },
    )
    if (existing) return existing
  } catch (e) {
    const err = e as { status?: number }
    if (err?.status !== 404) throw wrapPbError(e)
  }
  try {
    return await pb.collection('race_participants').create<RaceParticipant>({
      race: raceId,
      user: userId,
      display_name: displayName,
      status: 'joined',
      distance_km: 0,
      duration_seconds: 0,
      avg_pace: 0,
    })
  } catch (e) {
    const err = e as { status?: number }
    if (err?.status === 400) {
      // Unique-index conflict: another request inserted it first
      try {
        return await pb.collection('race_participants').getFirstListItem<RaceParticipant>(
          `race = "${raceId}" && user = "${userId}"`,
          { requestKey: null },
        )
      } catch (inner) {
        throw wrapPbError(inner)
      }
    }
    throw wrapPbError(e)
  }
}

export async function markReady(participantId: string): Promise<void> {
  try {
    await pb.collection('race_participants').update(participantId, { status: 'ready' })
  } catch (e) { throw wrapPbError(e) }
}

export async function startCountdown(raceId: string): Promise<Race> {
  const startsAt = new Date(serverNow() + RACE_COUNTDOWN_MS).toISOString()
  const endsAt = new Date(serverNow() + RACE_COUNTDOWN_MS + RACE_WINDOW_HOURS * 3600 * 1000).toISOString()
  try {
    return await pb.collection('races').update<Race>(raceId, {
      status: 'countdown',
      starts_at: startsAt,
      ends_at: endsAt,
    })
  } catch (e) { throw wrapPbError(e) }
}

export async function activateRace(raceId: string): Promise<Race> {
  try {
    return await pb.collection('races').update<Race>(raceId, { status: 'active' })
  } catch (e) { throw wrapPbError(e) }
}

export interface ProgressUpdate {
  distance_km: number
  duration_seconds: number
  avg_pace: number
  last_lat: number
  last_lng: number
}

export async function updateProgress(participantId: string, p: ProgressUpdate): Promise<void> {
  try {
    await pb.collection('race_participants').update(participantId, {
      distance_km: Math.round(p.distance_km * 100) / 100,
      duration_seconds: Math.round(p.duration_seconds),
      avg_pace: Math.round(p.avg_pace * 100) / 100,
      last_lat: p.last_lat,
      last_lng: p.last_lng,
      last_update: new Date(serverNow()).toISOString(),
      status: 'racing',
    })
  } catch (e) { throw wrapPbError(e) }
}

export interface FinishParticipantInput {
  distance_km: number
  duration_seconds: number
  avg_pace: number
  gps_track: RaceGpsPoint[]
  last_lat?: number
  last_lng?: number
}

export async function finishParticipant(participantId: string, p: FinishParticipantInput): Promise<void> {
  try {
    await pb.collection('race_participants').update(participantId, {
      distance_km: Math.round(p.distance_km * 100) / 100,
      duration_seconds: Math.round(p.duration_seconds),
      avg_pace: Math.round(p.avg_pace * 100) / 100,
      status: 'finished',
      finished_at: new Date(serverNow()).toISOString(),
      last_update: new Date(serverNow()).toISOString(),
      gps_track: p.gps_track,
      ...(p.last_lat != null ? { last_lat: p.last_lat } : {}),
      ...(p.last_lng != null ? { last_lng: p.last_lng } : {}),
    })
  } catch (e) { throw wrapPbError(e) }
}

export async function finishRace(raceId: string): Promise<void> {
  try {
    await pb.collection('races').update(raceId, {
      status: 'finished',
      finished_at: new Date(serverNow()).toISOString(),
    })
  } catch (e) { throw wrapPbError(e) }
}

export async function cancelRace(raceId: string): Promise<void> {
  try {
    await pb.collection('races').update(raceId, { status: 'cancelled' })
  } catch (e) { throw wrapPbError(e) }
}

export async function leaveRace(participantId: string): Promise<void> {
  try {
    await pb.collection('race_participants').delete(participantId)
  } catch (e) { throw wrapPbError(e) }
}

export async function markDnf(participantId: string): Promise<void> {
  try {
    await pb.collection('race_participants').update(participantId, {
      status: 'dnf',
      finished_at: new Date(serverNow()).toISOString(),
    })
  } catch (e) { throw wrapPbError(e) }
}
