// Sincronización de la sesión de fuerza EN CURSO con PocketBase
// (colección `active_sessions`, un registro por usuario, upsert continuo).
// Complementa la persistencia local de cada ActiveSessionContext: lo local
// sigue siendo la fuente rápida/offline; el server habilita reanudar en otro
// dispositivo (web ↔ mobile).
//
// Escrituras con throttle (una cada THROTTLE_MS como máximo) + flush explícito
// al pasar a background/ocultar pestaña. Todos los errores de red se tragan:
// la sesión nunca debe romperse por fallar el sync.
import { pb } from './pocketbase'

export interface RemoteActiveSession<TWorkout = unknown, TProgress = unknown> {
  workout: TWorkout
  workoutKey: string
  source: 'program' | 'free'
  progress: TProgress
  startedAt: number
  sectionStartTime: number | null
  savedAt: number
  platform?: string
}

const COLLECTION = 'active_sessions'
const THROTTLE_MS = 15_000
export const MAX_REMOTE_SESSION_AGE_MS = 24 * 60 * 60 * 1000

let recordId: string | null = null
let pending: RemoteActiveSession | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let lastPushAt = 0
let inFlight: Promise<void> | null = null

function authedUserId(): string | null {
  if (!pb.authStore.isValid) return null
  const record = (pb.authStore as any).record ?? (pb.authStore as any).model
  return record?.id ?? null
}

function toBody(userId: string, p: RemoteActiveSession) {
  return {
    user: userId,
    workout: p.workout,
    workout_key: p.workoutKey,
    source: p.source,
    progress: p.progress,
    started_at: p.startedAt,
    section_start_time: p.sectionStartTime,
    saved_at: p.savedAt,
    platform: p.platform ?? '',
  }
}

async function findRecordId(userId: string): Promise<string | null> {
  try {
    const rec = await pb.collection(COLLECTION).getFirstListItem(`user = "${userId}"`, { requestKey: null })
    return rec.id
  } catch {
    return null
  }
}

async function pushNow(p: RemoteActiveSession): Promise<void> {
  const userId = authedUserId()
  if (!userId) return
  const body = toBody(userId, p)
  try {
    if (!recordId) recordId = await findRecordId(userId)
    if (recordId) {
      await pb.collection(COLLECTION).update(recordId, body, { requestKey: null })
    } else {
      const rec = await pb.collection(COLLECTION).create(body, { requestKey: null })
      recordId = rec.id
    }
    lastPushAt = Date.now()
  } catch {
    // Registro borrado desde otro dispositivo (404) o índice único (otro
    // dispositivo creó primero): reintenta una vez re-resolviendo el id.
    try {
      recordId = await findRecordId(userId)
      if (recordId) {
        await pb.collection(COLLECTION).update(recordId, body, { requestKey: null })
      } else {
        const rec = await pb.collection(COLLECTION).create(body, { requestKey: null })
        recordId = rec.id
      }
      lastPushAt = Date.now()
    } catch { /* offline o server caído — el próximo push lo reintenta */ }
  }
}

function drain(): void {
  const p = pending
  pending = null
  if (!p) return
  // Serializa los pushes: nunca dos requests de upsert en paralelo.
  inFlight = (inFlight ?? Promise.resolve()).then(() => pushNow(p)).then(() => { inFlight = null })
}

/** Encola un push al server (throttled). Llamar en cada persist local. */
export function scheduleActiveSessionPush(p: RemoteActiveSession): void {
  pending = p
  if (timer) return
  const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastPushAt))
  timer = setTimeout(() => { timer = null; drain() }, wait)
}

/** Empuja inmediatamente lo pendiente (al ir a background / ocultar pestaña). */
export function flushActiveSessionPush(): void {
  if (timer) { clearTimeout(timer); timer = null }
  drain()
}

/** Push inmediato sin pasar por el throttle (arranque de sesión). */
export function pushActiveSessionNow(p: RemoteActiveSession): void {
  pending = p
  flushActiveSessionPush()
}

/**
 * Trae la sesión activa del server para el usuario autenticado.
 * Devuelve null si no hay, si está caducada (>24h) o si hay error de red.
 */
export async function fetchRemoteActiveSession<TW = unknown, TP = unknown>(): Promise<RemoteActiveSession<TW, TP> | null> {
  const userId = authedUserId()
  if (!userId) return null
  try {
    const rec = await pb.collection(COLLECTION).getFirstListItem(`user = "${userId}"`, { requestKey: null })
    recordId = rec.id
    const session: RemoteActiveSession<TW, TP> = {
      workout: rec.workout,
      workoutKey: rec.workout_key,
      source: rec.source === 'free' ? 'free' : 'program',
      progress: rec.progress,
      startedAt: rec.started_at,
      sectionStartTime: rec.section_start_time ?? null,
      savedAt: rec.saved_at ?? rec.started_at,
      platform: rec.platform || undefined,
    }
    if (!session.workout || !session.workoutKey || !session.progress) return null
    if (Date.now() - session.startedAt > MAX_REMOTE_SESSION_AGE_MS) return null
    return session
  } catch {
    return null
  }
}

/** Borra la sesión activa del server (fin/descartar sesión). Fire-and-forget. */
export function clearRemoteActiveSession(): void {
  if (timer) { clearTimeout(timer); timer = null }
  pending = null
  const userId = authedUserId()
  if (!userId) { recordId = null; return }
  inFlight = (inFlight ?? Promise.resolve()).then(async () => {
    try {
      const id = recordId ?? await findRecordId(userId)
      if (id) await pb.collection(COLLECTION).delete(id, { requestKey: null })
    } catch { /* ignore */ }
    recordId = null
    inFlight = null
  })
}
