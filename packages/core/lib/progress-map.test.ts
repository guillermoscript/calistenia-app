/**
 * Fusión de la cola offline con el progreso del servidor (issue #301).
 *
 * Cubre las funciones puras de `progress-map` (antes exportadas «solo para
 * testear» desde useProgress, extraídas a lib en #476): la reconstrucción del
 * `ProgressMap` y el filtrado de lo que sigue encolado.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

const mem = new Map<string, string>()

vi.mock('../platform', () => ({
  storage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
  },
  getPlatform: () => ({
    connectivity: { isOnline: () => true, onOnline: () => () => {}, onChange: () => () => {} },
    reportError: vi.fn(),
  }),
}))

import { utcToLocalDateStr } from './dateUtils'
import { clearQueue, enqueue } from './offlineQueue'
import {
  buildProgressMap,
  pendingNotYetOnServer,
  pendingProgressRows,
} from './progress-map'

const sessionRowsOf = (uid: string, pid: string | null, server: any[] = []) =>
  pendingProgressRows(uid, pid, server, []).sessions
const setRowsOf = (uid: string, server: any[] = []) =>
  pendingProgressRows(uid, null, [], server).sets

const AT = '2026-08-15 09:00:00.000Z'
const DAY = utcToLocalDateStr(AT)

/** Fila de `sessions` tal como la devuelve PocketBase. */
function sessionRow(over: Record<string, unknown> = {}) {
  return { id: 's1', user: 'u1', workout_key: 'p1_lun', completed_at: AT, note: '', ...over }
}

/** Fila de `sets_log` tal como la devuelve PocketBase. */
function setRow(over: Record<string, unknown> = {}) {
  return { id: 'x1', user: 'u1', exercise_id: 'pullups', workout_key: 'p1_lun', reps: '8', logged_at: AT, ...over }
}

beforeEach(() => {
  mem.clear()
  clearQueue()
})

describe('buildProgressMap', () => {
  it('reconstruye sesiones, series y días de cardio', () => {
    const prog = buildProgressMap(
      [sessionRow({ note: 'duro' })],
      [setRow(), setRow({ id: 'x2', reps: '10' })],
      [{ id: 'c1', program_day_key: 'p1_mie', started_at: AT, note: '' }],
    )
    expect(prog[`done_${DAY}_p1_lun`]).toMatchObject({ done: true, workoutKey: 'p1_lun', note: 'duro', count: 1 })
    expect((prog[`${DAY}_p1_lun_pullups`] as any).sets.map((s: any) => s.reps)).toEqual(['8', '10'])
    expect(prog[`done_${DAY}_p1_mie`]).toMatchObject({ cardioSessionId: 'c1' })
  })

  // #640: un circuito de programa terminado tiene que poner el check del día.
  // La fila es la real que deja el arranque del #625: `program_day_key` con el
  // formato p{fase}_{día} y su `started_at`.
  it('marca el día hecho con un circuito de programa, etiquetado circuitSessionId', () => {
    const prog = buildProgressMap(
      [],
      [],
      [],
      [{ id: 'q1', program_day_key: 'p1_mie', started_at: AT, note: 'brutal' }],
    )
    expect(prog[`done_${DAY}_p1_mie`]).toMatchObject({
      done: true, workoutKey: 'p1_mie', note: 'brutal', circuitSessionId: 'q1',
    })
  })

  it('ignora circuitos sueltos (sin program_day_key) y sin fecha usable', () => {
    const prog = buildProgressMap(
      [],
      [],
      [],
      [
        { id: 'q1', started_at: AT, note: '' },
        { id: 'q2', program_day_key: 'p1_jue', note: '' },
      ],
    )
    expect(Object.keys(prog)).toEqual([])
  })

  // El marcador de `sessions` lleva count/timings y sí alimenta estadísticas:
  // el del circuito no debe pisarlo si ambos caen el mismo día+clave.
  it('no pisa el marcador de una sesión de fuerza del mismo día y clave', () => {
    const prog = buildProgressMap(
      [sessionRow({ workout_key: 'p1_mie', note: 'fuerza' })],
      [],
      [],
      [{ id: 'q1', program_day_key: 'p1_mie', started_at: AT, note: 'circuito' }],
    )
    expect(prog[`done_${DAY}_p1_mie`]).toMatchObject({ note: 'fuerza', count: 1 })
    expect(prog[`done_${DAY}_p1_mie`]).not.toHaveProperty('circuitSessionId')
  })

  it('acumula el conteo cuando el mismo entreno se repite el mismo día', () => {
    const prog = buildProgressMap([sessionRow(), sessionRow({ id: 's2' })], [], [])
    expect((prog[`done_${DAY}_p1_lun`] as any).count).toBe(2)
  })

  // El corazón del #301: lo encolado se pinta igual que lo del servidor, así que
  // `lsSet` ya no borra del dispositivo el entreno que aún no ha podido subir.
  it('pinta un pendiente de la cola como si viniera del servidor', () => {
    const pending = { user: 'u1', workout_key: 'p2_vie', completed_at: AT, note: '', client_id: 'c_pend' }
    const prog = buildProgressMap([pending, sessionRow()], [], [])
    expect(prog[`done_${DAY}_p2_vie`]).toMatchObject({ done: true, workoutKey: 'p2_vie', count: 1 })
    expect(prog[`done_${DAY}_p1_lun`]).toMatchObject({ done: true })
  })
})

describe('pendingNotYetOnServer', () => {
  // Las filas reales (cola local y PocketBase) traen más campos que el
  // `client_id` que mira la función; se declaran aquí para que el literal del
  // test tenga la misma forma laxa que en producción.
  type Row = { client_id?: string; id?: string; reps?: string }

  // La ventana ciega: el create se encoló tras un `status: 0` pero sí llegó.
  // Hasta que la cola drene y descubra el `validation_not_unique`, superponerlo
  // sobre la fila real duplicaría la serie en pantalla.
  it('descarta el pendiente cuyo client_id ya devolvió el servidor', () => {
    const pending = [{ client_id: 'a' }, { client_id: 'b' }]
    expect(pendingNotYetOnServer(pending, [{ client_id: 'a' }])).toEqual([{ client_id: 'b' }])
  })

  it('conserva los pendientes sin client_id (filas anteriores a la migración)', () => {
    const pending: Row[] = [{ reps: '8' }]
    expect(pendingNotYetOnServer(pending, [{ client_id: 'a' }])).toEqual([{ reps: '8' }])
  })

  it('ignora las filas del servidor sin client_id al comparar', () => {
    const pending = [{ client_id: 'a' }]
    const serverRows: Row[] = [{ id: 'srv1' }, { client_id: '' }]
    expect(pendingNotYetOnServer(pending, serverRows)).toEqual(pending)
  })
})

describe('pendingProgressRows · sesiones', () => {
  it('deja fuera las sesiones de otro usuario', () => {
    enqueue({ collection: 'sessions', action: 'create', data: { user: 'u1', workout_key: 'p1_lun' } })
    enqueue({ collection: 'sessions', action: 'create', data: { user: 'otro', workout_key: 'p1_mar' } })
    expect(sessionRowsOf('u1', null).map(r => r.workout_key)).toEqual(['p1_lun'])
  })

  // Mismo criterio que el sessionFilter de loadFromPB:
  // `user = uid && (program = pid || program = "")`.
  it('con programa activo deja pasar ese programa y las sesiones libres, no las de otro programa', () => {
    enqueue({ collection: 'sessions', action: 'create', data: { user: 'u1', workout_key: 'a', program: 'prog1' } })
    enqueue({ collection: 'sessions', action: 'create', data: { user: 'u1', workout_key: 'b' } })
    enqueue({ collection: 'sessions', action: 'create', data: { user: 'u1', workout_key: 'c', program: 'prog2' } })
    expect(sessionRowsOf('u1', 'prog1').map(r => r.workout_key)).toEqual(['a', 'b'])
  })

  it('sin programa activo no filtra por programa', () => {
    enqueue({ collection: 'sessions', action: 'create', data: { user: 'u1', workout_key: 'c', program: 'prog2' } })
    expect(sessionRowsOf('u1', null)).toHaveLength(1)
  })

  it('ignora lo encolado de otras colecciones y las acciones que no son create', () => {
    enqueue({ collection: 'water_entries', action: 'create', data: { user: 'u1', amount_ml: 250 } })
    enqueue({ collection: 'sessions', action: 'delete', recordId: 'srv_1' })
    expect(sessionRowsOf('u1', null)).toEqual([])
  })
})

describe('pendingProgressRows · series', () => {
  it('filtra por usuario y no por programa', () => {
    enqueue({ collection: 'sets_log', action: 'create', data: { user: 'u1', exercise_id: 'pullups' } })
    enqueue({ collection: 'sets_log', action: 'create', data: { user: 'otro', exercise_id: 'dips' } })
    expect(setRowsOf('u1').map(r => r.exercise_id)).toEqual(['pullups'])
  })

  it('no duplica la serie que el servidor ya devolvió', () => {
    enqueue({ collection: 'sets_log', action: 'create', data: { user: 'u1', exercise_id: 'pullups', client_id: 'k1' } })
    expect(setRowsOf('u1', [setRow({ client_id: 'k1' })])).toEqual([])
  })

  // Sesiones y series salen de la MISMA lectura de la cola: no puede colarse un
  // drenado entre ambas y dejar cada mitad en un snapshot distinto.
  it('devuelve sesiones y series de una sola pasada, cada una con su filtro', () => {
    enqueue({ collection: 'sessions', action: 'create', data: { user: 'u1', workout_key: 'p1_lun', program: 'prog2' } })
    enqueue({ collection: 'sets_log', action: 'create', data: { user: 'u1', exercise_id: 'pullups' } })
    const out = pendingProgressRows('u1', 'prog1', [], [])
    expect(out.sessions).toEqual([]) // el programa no casa
    expect(out.sets.map(r => r.exercise_id)).toEqual(['pullups']) // las series no se filtran por programa
  })
})
