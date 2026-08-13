/**
 * Programas de comunidad con hitos semanales (#353).
 *
 * Los hooks son finos a propósito: todo el cálculo vive en
 * `lib/community-programs.ts` (funciones puras y testeadas) y aquí solo queda
 * el acceso a PocketBase, la unión idempotente y los eventos.
 *
 * Lo único que se persiste es la PERTENENCIA. El progreso se recalcula en cada
 * lectura desde `sessions` / `cardio_sessions`, igual que la puntuación
 * acumulativa de retos (#352): así un hito no puede completarse dos veces y
 * editar o borrar un entreno se refleja solo.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { storage } from '../platform'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '../lib/analytics'
import { addDays, localMidnightAsUTC, nowLocalForPB, todayStr, utcToLocalDateStr } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import { findExistingPresetChallenge, getBeginnerChallengePreset, type PresetParticipantRecord } from '../lib/challenge-presets'
import {
  buildWeekWindows,
  computeProgramProgress,
  countWorkoutsInWindow,
  getProgramQueryRange,
  type CommunityProgramProgress,
} from '../lib/community-programs'
import type {
  CommunityProgram,
  CommunityProgramMember,
  CommunityProgramMilestone,
} from '../types'

/** Superficie de analytics de todo el feature. */
const SURFACE = 'community_program'

export interface CommunityProgramCard extends CommunityProgram {
  /** null si el usuario nunca se apuntó; `status: 'left'` si lo dejó. */
  membership: CommunityProgramMember | null
}

/** Reto enlazado por un hito de tipo `challenge`. */
export interface MilestoneChallengeLink {
  /** false = el `preset_key` no existe en el catálogo → hito roto, estado seguro. */
  presetKnown: boolean
  /** id del reto del usuario, o null si aún no se ha unido. */
  challengeId: string | null
}

export interface CommunityProgramDetail {
  program: CommunityProgram | null
  milestones: CommunityProgramMilestone[]
  membership: CommunityProgramMember | null
  /** null mientras no haya pertenencia activa: sin inicio no hay ventanas. */
  progress: CommunityProgramProgress | null
  challengeLinks: Record<string, MilestoneChallengeLink>
}

/**
 * Los campos `date` de PB vuelven como `2026-08-13 00:00:00.000Z`. El día de
 * calendario es el que se guardó, así que se recorta en vez de convertirlo de
 * zona horaria: desplazarlo movería el inicio un día para quien esté al oeste
 * de UTC (mismo criterio que `formatDateRange` con las fechas de retos).
 */
function toDayString(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : ''
}

function normalizeProgram(record: any): CommunityProgram {
  return {
    id: record.id,
    slug: record.slug || '',
    title_key: record.title_key || '',
    description_key: record.description_key || '',
    duration_days: Number(record.duration_days) || 0,
    difficulty: record.difficulty || 'beginner',
    icon: record.icon || undefined,
    is_published: !!record.is_published,
    sort_order: Number(record.sort_order) || 0,
  }
}

function normalizeMilestone(record: any): CommunityProgramMilestone {
  return {
    id: record.id,
    program: record.program,
    week: Number(record.week) || 0,
    title_key: record.title_key || '',
    description_key: record.description_key || undefined,
    kind: record.kind === 'challenge' ? 'challenge' : 'workout_count',
    target: Number(record.target) || 0,
    preset_key: record.preset_key || undefined,
    sort_order: Number(record.sort_order) || 0,
  }
}

function normalizeMember(record: any): CommunityProgramMember {
  return {
    id: record.id,
    program: record.program,
    user: record.user,
    started_at: toDayString(record.started_at),
    status: record.status === 'left' ? 'left' : 'active',
    left_at: record.left_at || undefined,
  }
}

async function findMembership(programId: string, userId: string): Promise<CommunityProgramMember | null> {
  try {
    const record = await pb.collection('community_program_members').getFirstListItem(
      pb.filter('program = {:pid} && user = {:uid}', { pid: programId, uid: userId }),
      { $autoCancel: false },
    )
    return normalizeMember(record)
  } catch {
    return null
  }
}

/**
 * Garantiza UNA pertenencia activa. Es idempotente por tres caminos:
 *
 *  1. Ya existe y está activa → se devuelve tal cual.
 *  2. Existe pero se abandonó → se reactiva **conservando `started_at`**, así
 *     que volver reanuda el progreso en lugar de reiniciarlo, y los hitos ya
 *     conseguidos no se pueden volver a contar.
 *  3. No existe → se crea. Si dos toques o dos dispositivos corren a la vez, el
 *     índice único `(program, user)` hace fallar al segundo; ese error se
 *     reconvierte en una lectura, no se propaga.
 */
async function ensureMembership(programId: string, userId: string): Promise<CommunityProgramMember> {
  const existing = await findMembership(programId, userId)
  if (existing) {
    if (existing.status === 'active') return existing
    const reactivated = await pb.collection('community_program_members').update(existing.id, { status: 'active' })
    return normalizeMember(reactivated)
  }

  try {
    const created = await pb.collection('community_program_members').create({
      program: programId,
      user: userId,
      started_at: todayStr(),
      status: 'active',
    })
    return normalizeMember(created)
  } catch (error) {
    const raced = await findMembership(programId, userId)
    if (!raced) throw error
    if (raced.status === 'active') return raced
    const reactivated = await pb.collection('community_program_members').update(raced.id, { status: 'active' })
    return normalizeMember(reactivated)
  }
}

// ─── Listado / descubrimiento ────────────────────────────────────────────────

export function useCommunityPrograms(userId: string | null) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: qk.communityPrograms(userId),
    queryFn: async (): Promise<CommunityProgramCard[]> => {
      const available = await isPocketBaseAvailable()
      if (!available) return []

      const [programs, members] = await Promise.all([
        pb.collection('community_programs').getFullList({
          filter: 'is_published = true',
          sort: 'sort_order,slug',
          $autoCancel: false,
        }).catch(() => [] as any[]),
        userId
          ? pb.collection('community_program_members').getFullList({
              filter: pb.filter('user = {:uid}', { uid: userId }),
              $autoCancel: false,
            }).catch(() => [] as any[])
          : Promise.resolve([] as any[]),
      ])

      const byProgram = new Map<string, CommunityProgramMember>()
      for (const record of members) {
        byProgram.set(record.program, normalizeMember(record))
      }

      return programs.map(record => ({
        ...normalizeProgram(record),
        membership: byProgram.get(record.id) ?? null,
      }))
    },
  })

  const joinMutation = useMutation({
    mutationFn: async ({ programId, source }: { programId: string; source: string }) => {
      if (!userId) throw new Error('not authenticated')
      const before = await findMembership(programId, userId)
      const membership = await ensureMembership(programId, userId)
      return { membership, wasAlreadyActive: before?.status === 'active', resumed: before?.status === 'left', source }
    },
    onSuccess: ({ membership, wasAlreadyActive, resumed, source }) => {
      // Un segundo toque no vuelve a emitir: el evento cuenta uniones, no taps.
      if (!wasAlreadyActive) {
        trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.communityProgramJoined, {
          surface: SURFACE,
          source,
          community_program_id: membership.program,
          result: resumed ? 'resumed' : 'joined',
        })
      }
      void qc.invalidateQueries({ queryKey: qk.communityPrograms(userId) })
      void qc.invalidateQueries({ queryKey: qk.communityProgram(membership.program, userId) })
    },
  })

  const leaveMutation = useMutation({
    mutationFn: async ({ programId, source }: { programId: string; source: string }) => {
      if (!userId) throw new Error('not authenticated')
      const existing = await findMembership(programId, userId)
      if (!existing || existing.status === 'left') return { programId, source, changed: false }
      // Nunca se borra la fila: `started_at` tiene que sobrevivir para que
      // volver a entrar reanude en vez de reiniciar.
      await pb.collection('community_program_members').update(existing.id, {
        status: 'left',
        left_at: nowLocalForPB(),
      })
      return { programId, source, changed: true }
    },
    onSuccess: ({ programId, source, changed }) => {
      if (changed) {
        trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.communityProgramLeft, {
          surface: SURFACE,
          source,
          community_program_id: programId,
          result: 'left',
        })
      }
      void qc.invalidateQueries({ queryKey: qk.communityPrograms(userId) })
      void qc.invalidateQueries({ queryKey: qk.communityProgram(programId, userId) })
    },
  })

  /** Propaga el error a propósito: quien llama tiene que poder avisar al usuario. */
  const join = useCallback(
    (programId: string, source = 'community_program_list') =>
      joinMutation.mutateAsync({ programId, source }),
    [joinMutation],
  )

  const leave = useCallback(
    (programId: string, source = 'community_program_detail') =>
      leaveMutation.mutateAsync({ programId, source }),
    [leaveMutation],
  )

  return {
    programs: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    join,
    leave,
    joining: joinMutation.isPending,
    leaving: leaveMutation.isPending,
  }
}

// ─── Detalle + progreso ──────────────────────────────────────────────────────

/**
 * Marca de una sola emisión para los eventos DERIVADOS. Como el progreso se
 * recalcula en cada lectura, sin esto se emitiría un evento de hito completado
 * en cada refresco. Contrapartida conocida (la misma que en `useProgress`): si
 * el usuario borra el entreno que completaba el hito, la marca ya está puesta y
 * no se vuelve a emitir aunque lo recupere.
 */
function emitOnce(key: string, emit: () => void): void {
  try {
    if (storage.getItem(key)) return
    storage.setItem(key, 'true')
  } catch {
    // Sin storage disponible se prefiere emitir a perder el evento.
  }
  emit()
}

function emitDerivedEvents(userId: string, programId: string, progress: CommunityProgramProgress): void {
  for (const milestone of progress.milestones) {
    if (!milestone.isComplete) continue
    emitOnce(`calistenia_community_milestone_${userId}_${programId}_${milestone.milestone.id}`, () => {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.communityProgramMilestoneCompleted, {
        surface: SURFACE,
        source: 'progress_recompute',
        community_program_id: programId,
        milestone_id: milestone.milestone.id,
        result: 'milestone_completed',
      })
    })
  }

  if (progress.isComplete) {
    emitOnce(`calistenia_community_program_done_${userId}_${programId}`, () => {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.communityProgramCompleted, {
        surface: SURFACE,
        source: 'progress_recompute',
        community_program_id: programId,
        result: 'completed',
      })
    })
  }
}

/**
 * Resuelve los retos enlazados por los hitos de tipo `challenge`. Un
 * `preset_key` que ya no existe en el catálogo (reto retirado o borrado) deja
 * `presetKnown: false`, y el módulo puro lo pinta como hito roto en vez de
 * dejarlo pendiente para siempre.
 */
async function resolveChallengeLinks(
  userId: string,
  milestones: CommunityProgramMilestone[],
): Promise<Record<string, MilestoneChallengeLink>> {
  const linked = milestones.filter(m => m.kind === 'challenge')
  if (!linked.length) return {}

  const records = await pb.collection('challenge_participants').getFullList({
    filter: pb.filter('user = {:uid}', { uid: userId }),
    expand: 'challenge',
    $autoCancel: false,
  }).catch(() => [] as any[])

  const links: Record<string, MilestoneChallengeLink> = {}
  for (const milestone of linked) {
    const preset = milestone.preset_key ? getBeginnerChallengePreset(milestone.preset_key) : null
    if (!preset) {
      links[milestone.id] = { presetKnown: false, challengeId: null }
      continue
    }
    const existing = findExistingPresetChallenge(records as PresetParticipantRecord[], preset.id)
    links[milestone.id] = { presetKnown: true, challengeId: existing?.id ?? null }
  }
  return links
}

export function useCommunityProgramDetail(programId: string, userId: string | null) {
  const viewedRef = useRef<string | null>(null)

  const query = useQuery({
    queryKey: qk.communityProgram(programId, userId),
    enabled: !!programId,
    queryFn: async (): Promise<CommunityProgramDetail> => {
      const empty: CommunityProgramDetail = {
        program: null, milestones: [], membership: null, progress: null, challengeLinks: {},
      }
      const available = await isPocketBaseAvailable()
      if (!available) return empty

      const record = await pb.collection('community_programs').getOne(programId, { $autoCancel: false }).catch(() => null)
      if (!record) return empty
      const program = normalizeProgram(record)

      const milestoneRecords = await pb.collection('community_program_milestones').getFullList({
        filter: pb.filter('program = {:pid}', { pid: programId }),
        sort: 'week,sort_order',
        $autoCancel: false,
      }).catch(() => [] as any[])
      const milestones = milestoneRecords.map(normalizeMilestone)

      const membership = userId ? await findMembership(programId, userId) : null
      // Sin pertenencia activa no hay día de inicio, y sin día de inicio no hay
      // ventanas: se muestra el contenido del programa y nada de progreso.
      if (!userId || !membership || membership.status !== 'active') {
        return { program, milestones, membership, progress: null, challengeLinks: {} }
      }

      const { startDay, endDay } = getProgramQueryRange(membership.started_at, program.duration_days)
      // Una sola consulta por TODO el programa; plegar por semanas se hace en
      // memoria. Una consulta por semana serían N idas y vueltas por pantalla.
      const startFilter = localMidnightAsUTC(startDay)
      const endFilter = localMidnightAsUTC(addDays(endDay, 1))

      const [sessions, cardio] = await Promise.all([
        pb.collection('sessions').getFullList({
          filter: pb.filter('user = {:uid} && completed_at >= {:start} && completed_at < {:end}', {
            uid: userId, start: startFilter, end: endFilter,
          }),
          fields: 'workout_key,completed_at',
          $autoCancel: false,
        }).catch(() => [] as any[]),
        pb.collection('cardio_sessions').getFullList({
          filter: pb.filter('user = {:uid} && started_at >= {:start} && started_at < {:end}', {
            uid: userId, start: startFilter, end: endFilter,
          }),
          fields: 'id,started_at',
          $autoCancel: false,
        }).catch(() => [] as any[]),
      ])

      const challengeLinks = await resolveChallengeLinks(userId, milestones)

      // Los hitos de reto puntúan con el MISMO recuento de entrenos que los de
      // `workout_count`; el reto enlazado añade el componente social, no otra
      // forma de puntuar. Si el preset ya no existe, no se aporta progreso y el
      // módulo puro lo marca como roto.
      const windows = buildWeekWindows(membership.started_at, program.duration_days)
      const challengeProgress: Record<string, number> = {}
      for (const milestone of milestones) {
        if (milestone.kind !== 'challenge') continue
        if (!challengeLinks[milestone.id]?.presetKnown) continue
        const window = windows.find(w => w.week === milestone.week)
        if (!window) continue
        challengeProgress[milestone.id] = countWorkoutsInWindow(window, sessions as any, cardio as any, utcToLocalDateStr)
      }

      const progress = computeProgramProgress({
        program,
        startedOn: membership.started_at,
        milestones,
        sessions: sessions as any,
        cardio: cardio as any,
        utcToLocalDay: utcToLocalDateStr,
        today: todayStr(),
        challengeProgress,
      })

      emitDerivedEvents(userId, programId, progress)

      return { program, milestones, membership, progress, challengeLinks }
    },
  })

  // `community_program_viewed` una vez por programa y montaje.
  useEffect(() => {
    if (!query.data?.program) return
    if (viewedRef.current === programId) return
    viewedRef.current = programId
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.communityProgramViewed, {
      surface: SURFACE,
      source: 'community_program_detail',
      community_program_id: programId,
      result: query.data.membership?.status === 'active' ? 'joined' : 'viewed',
    })
  }, [programId, query.data])

  return {
    program: query.data?.program ?? null,
    milestones: query.data?.milestones ?? [],
    membership: query.data?.membership ?? null,
    progress: query.data?.progress ?? null,
    challengeLinks: query.data?.challengeLinks ?? {},
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
