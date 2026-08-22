/**
 * Las consultas del muro y su mapeo.
 *
 * Lo que fija este fichero, en orden de importancia:
 *
 * 1. **El formato del cursor.** Cada colección guarda su marca temporal en un
 *    formato distinto (`2026-08-09 16:58:12.000Z` con espacio en `sessions`,
 *    `2026-08-09T16:58:12Z` con `T` en cardio). El hook antiguo paginaba TODAS
 *    con un único cursor ya normalizado a ISO, y como `' ' < 'T'` en orden
 *    lexicográfico, `completed_at < '…T16:58…'` dejaba pasar sesiones
 *    POSTERIORES del mismo día: la segunda página repetía posts de la primera.
 * 2. **Que ninguna fuente pueda vaciar el muro.** Si la colección de retos falla
 *    (regla, red, colección sin desplegar), el resto de la actividad tiene que
 *    seguir apareciendo.
 * 3. **Que los datos ajenos raros no rompan el mapeo**: `exercise_timings`
 *    corrupto, `expand` ausente, JSON como cadena.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  /** Respuestas consecutivas para una colección que se consulta más de una vez. */
  queue: {} as Record<string, Record<string, unknown>[][]>,
  calls: [] as { collection: string; options: Record<string, unknown> }[],
  fail: new Set<string>(),
}))

vi.mock('./pocketbase', () => ({
  pb: {
    // El `pb.filter` real escapa e interpola; para el test basta con sustituir
    // los marcadores, que es lo que hace visible el formato del cursor.
    filter: (expr: string, params: Record<string, unknown> = {}) =>
      expr.replace(/\{:(\w+)\}/g, (_, k) => `'${String(params[k])}'`),
    collection: (name: string) => ({
      getList: async (_page: number, _perPage: number, options: Record<string, unknown>) => {
        db.calls.push({ collection: name, options })
        if (db.fail.has(name)) throw new Error(`${name} caído`)
        const queued = db.queue[name]?.shift()
        return { items: queued ?? db.rows[name] ?? [] }
      },
    }),
  },
  getUserAvatarUrl: () => null,
  isPocketBaseAvailable: async () => true,
}))

vi.mock('i18next', () => ({
  // `on` hace falta porque `dateUtils` se suscribe a `languageChanged` al
  // cargarse; sin él el módulo revienta al importarse y no corre ni un test.
  default: { t: (key: string) => key, language: 'es', on: () => {} },
}))

import { FEED_SOURCES, type FeedSourceContext } from './feed-sources'

const ctx = (cursor: string | null = null): FeedSourceContext => ({
  userIds: ['u1', 'u2'],
  viewerId: 'u1',
  userMap: { u1: { name: 'Ana', avatarUrl: null }, u2: { name: 'Beto', avatarUrl: null } },
  cursor,
})

/** El filtro con el que se llamó a una colección. */
function filterFor(collection: string): string {
  const call = [...db.calls].reverse().find(c => c.collection === collection)
  return String(call?.options.filter ?? '')
}

beforeEach(() => {
  db.rows = {}
  db.queue = {}
  db.calls = []
  db.fail = new Set()
})

describe('cursor de paginación', () => {
  // EL bug: `sessions.completed_at` es una fecha de PocketBase con ESPACIO. Si
  // el cursor lleva 'T', el filtro deja pasar filas posteriores del mismo día
  // porque ' ' (0x20) < 'T' (0x54).
  it('las sesiones paginan con el valor CRUDO de la columna, con espacio', async () => {
    db.rows.public_sessions = [
      { id: 's1', user: 'u1', workout_key: 'free_1', completed_at: '2026-08-09 16:58:12.000Z' },
      { id: 's2', user: 'u1', workout_key: 'free_2', completed_at: '2026-08-09 09:00:00.000Z' },
    ]
    const { items } = await FEED_SOURCES.sessions(ctx())

    expect(items[0].cursor).toBe('2026-08-09 16:58:12.000Z')
    expect(items[0].cursor).not.toContain('T')
    // Y `completedAt`, que es lo que ordena el merge, sí va normalizado.
    expect(items[0].completedAt).toBe('2026-08-09T16:58:12.000Z')
  })

  it('el cardio pagina con su propio formato ISO, sin tocarlo', async () => {
    db.rows.public_cardio_sessions = [
      { id: 'c1', user: 'u1', activity_type: 'running', finished_at: '2026-08-09T16:58:12Z' },
    ]
    const { items } = await FEED_SOURCES.cardio(ctx())
    expect(items[0].cursor).toBe('2026-08-09T16:58:12Z')
  })

  it('cada fuente filtra por SU columna de tiempo', async () => {
    await FEED_SOURCES.sessions(ctx('2026-08-09 16:58:12.000Z'))
    await FEED_SOURCES.cardio(ctx('2026-08-09T16:58:12Z'))
    await FEED_SOURCES.challenges(ctx('2026-08-01 00:00:00.000Z'))

    expect(filterFor('public_sessions')).toContain("completed_at < '2026-08-09 16:58:12.000Z'")
    expect(filterFor('public_cardio_sessions')).toContain("finished_at < '2026-08-09T16:58:12Z'")
    expect(filterFor('challenge_participants')).toContain("created < '2026-08-01 00:00:00.000Z'")
  })

  it('la primera página no lleva cláusula de cursor', async () => {
    await FEED_SOURCES.sessions(ctx(null))
    expect(filterFor('public_sessions')).not.toContain('completed_at <')
  })
})

describe('sesiones de fuerza', () => {
  it('saca los ejercicios de exercise_timings', async () => {
    db.rows.public_sessions = [{
      id: 's1', user: 'u1', workout_key: 'free_1', completed_at: '2026-08-09 10:00:00.000Z',
      duration_seconds: 2520,
      exercise_timings: [
        { exerciseId: 'pushup', exerciseName: 'Flexiones', seconds: 651 },
        { exerciseId: 'plank', exerciseName: 'Plank', seconds: 61 },
      ],
    }]
    const { items } = await FEED_SOURCES.sessions(ctx())
    expect(items[0].exerciseNames).toEqual(['Flexiones', 'Plank'])
    expect(items[0].durationSeconds).toBe(2520)
  })

  // Una fila antigua puede traer el JSON como cadena; un JSON corrupto no puede
  // tumbar el muro entero.
  it('tolera exercise_timings como cadena, corrupto o ausente', async () => {
    db.rows.public_sessions = [
      { id: 'a', user: 'u1', workout_key: 'free_1', completed_at: '2026-08-09 10:00:00.000Z', exercise_timings: '[{"exerciseName":"Dips"}]' },
      { id: 'b', user: 'u1', workout_key: 'free_1', completed_at: '2026-08-09 09:00:00.000Z', exercise_timings: '{roto' },
      { id: 'c', user: 'u1', workout_key: 'free_1', completed_at: '2026-08-09 08:00:00.000Z', exercise_timings: null },
      { id: 'd', user: 'u1', workout_key: 'free_1', completed_at: '2026-08-09 07:00:00.000Z', exercise_timings: [{ seconds: 3 }] },
    ]
    const { items } = await FEED_SOURCES.sessions(ctx())
    expect(items.map(i => i.exerciseNames)).toEqual([['Dips'], [], [], []])
  })

  // #376: el 0 de una sesión libre es legítimo y no debe degradarse a "Fase 1".
  it('no inventa una fase para las sesiones libres y manuales', async () => {
    db.rows.public_sessions = [
      { id: 'f', user: 'u1', workout_key: 'free_1', phase: 0, completed_at: '2026-08-09 10:00:00.000Z' },
      { id: 'm', user: 'u1', workout_key: 'manual_1', phase: 0, completed_at: '2026-08-09 09:00:00.000Z' },
      { id: 'p', user: 'u1', workout_key: 'p2_lun', phase: 2, completed_at: '2026-08-09 08:00:00.000Z' },
    ]
    const { items } = await FEED_SOURCES.sessions(ctx())
    expect(items.map(i => i.phase)).toEqual([0, 0, 2])
  })

  it('una sesión libre nunca sale sin título', async () => {
    db.rows.public_sessions = [
      { id: 'f', user: 'u1', workout_key: 'free_1783000000', completed_at: '2026-08-09 10:00:00.000Z' },
      { id: 'x', user: 'u1', workout_key: '', completed_at: '2026-08-09 09:00:00.000Z' },
    ]
    const { items } = await FEED_SOURCES.sessions(ctx())
    for (const i of items) expect(i.workoutTitle).toBeTruthy()
  })
})

describe('cardio y circuitos', () => {
  // El muro cuenta lo que alguien HIZO, no lo que está haciendo ahora mismo.
  it('excluye las sesiones que aún no han terminado', async () => {
    await FEED_SOURCES.cardio(ctx())
    await FEED_SOURCES.circuits(ctx())
    expect(filterFor('public_cardio_sessions')).toContain('finished_at != ""')
    expect(filterFor('public_circuit_sessions')).toContain('finished_at != ""')
  })

  it('mapea rondas y duración del circuito', async () => {
    db.rows.public_circuit_sessions = [{
      id: 'ci1', user: 'u2', finished_at: '2026-08-09T10:00:00.000Z',
      circuit_name: { es: 'Tabata torso', en: 'Upper Tabata' },
      rounds_completed: 2, rounds_target: 5, duration_seconds: 300, mode: 'circuit',
    }]
    const { items } = await FEED_SOURCES.circuits(ctx())
    expect(items[0].type).toBe('circuit')
    expect(items[0].circuit).toMatchObject({ roundsCompleted: 2, roundsTarget: 5 })
    expect(items[0].displayName).toBe('Beto')
  })
})

describe('retos', () => {
  it('distingue el reto que creaste del que te apuntaste', async () => {
    db.rows.challenge_participants = [
      { id: 'p1', user: 'u1', created: '2026-08-02 10:00:00.000Z', expand: { challenge: { id: 'c1', title: 'Mío', creator: 'u1', metric: 'most_pushups', goal: 100 } } },
      { id: 'p2', user: 'u1', created: '2026-08-01 10:00:00.000Z', expand: { challenge: { id: 'c2', title: 'De otro', creator: 'u9', metric: 'most_pushups', goal: 100 } } },
    ]
    const { items } = await FEED_SOURCES.challenges(ctx())
    expect(items.map(i => i.challenge?.role)).toEqual(['created', 'joined'])
    expect(items[0].challenge?.challengeId).toBe('c1')
  })

  // El reto se borró, o su creador está bloqueado y la regla no deja expandirlo:
  // sin datos no hay tarjeta que pintar.
  it('descarta la participación cuyo reto no se puede expandir', async () => {
    db.rows.challenge_participants = [
      { id: 'p1', user: 'u1', created: '2026-08-02 10:00:00.000Z' },
      { id: 'p2', user: 'u1', created: '2026-08-01 10:00:00.000Z', expand: {} },
      { id: 'p3', user: 'u1', created: '2026-07-01 10:00:00.000Z', expand: { challenge: { id: 'c3', title: 'Ok', creator: 'u1', metric: 'most_sessions' } } },
    ]
    const { items } = await FEED_SOURCES.challenges(ctx())
    expect(items.map(i => i.id)).toEqual(['p3'])
  })

  // `created` lo añade la migración 1784600000; las filas anteriores no lo
  // tienen y aparecerían fechadas en 1970 en lo alto —o en el fondo— del muro.
  it('excluye las participaciones sin timestamp', async () => {
    await FEED_SOURCES.challenges(ctx())
    expect(filterFor('challenge_participants')).toContain('created != ""')
  })
})

describe('carreras', () => {
  beforeEach(() => {
    db.rows.race_participants = [
      { id: 'rp2', user: 'u1', race: 'r1', status: 'finished', finished_at: '2026-08-09T10:05:00Z', distance_km: 10.1, duration_seconds: 2900, avg_pace: 4.8,
        expand: { race: { id: 'r1', name: '10K de barrio', activity_type: 'running', target_distance_km: 10 } } },
    ]
  })

  it('solo trae participaciones terminadas', async () => {
    await FEED_SOURCES.races(ctx())
    expect(filterFor('race_participants')).toContain('status = "finished"')
  })

  it('deriva el puesto por orden de llegada, como el contador de victorias', async () => {
    // `fetchRaces` consulta `race_participants` dos veces: primero las
    // participaciones del muro, luego TODOS los que terminaron esas carreras
    // para resolver el puesto. La segunda llega ya ordenada por `finished_at`
    // ascendente, igual que la devuelve PocketBase.
    db.queue.race_participants = [
      [{
        id: 'rp2', user: 'u1', race: 'r1', status: 'finished', finished_at: '2026-08-09T10:05:00Z',
        expand: { race: { id: 'r1', name: '10K', activity_type: 'running' } },
      }],
      [
        { id: 'rp1', race: 'r1', finished_at: '2026-08-09T10:01:00Z' },
        { id: 'rp2', race: 'r1', finished_at: '2026-08-09T10:05:00Z' },
        { id: 'rp3', race: 'r1', finished_at: '2026-08-09T10:09:00Z' },
      ],
    ]

    const { items } = await FEED_SOURCES.races(ctx())
    expect(items[0].race?.rank).toBe(2)
    expect(items[0].race?.totalParticipants).toBe(3)
  })

  it('sin ranking resuelto no inventa un puesto', async () => {
    db.queue.race_participants = [
      [{
        id: 'rp9', user: 'u1', race: 'r9', status: 'finished', finished_at: '2026-08-09T10:05:00Z',
        expand: { race: { id: 'r9', name: 'Suelta', activity_type: 'running' } },
      }],
      [],
    ]
    const { items } = await FEED_SOURCES.races(ctx())
    expect(items[0].race?.rank).toBeNull()
    expect(items[0].race?.totalParticipants).toBe(0)
  })

  it('descarta la participación cuya carrera no se puede expandir', async () => {
    db.queue.race_participants = [
      [{ id: 'rp1', user: 'u1', race: 'r1', status: 'finished', finished_at: '2026-08-09T10:05:00Z' }],
      [],
    ]
    const { items } = await FEED_SOURCES.races(ctx())
    expect(items).toEqual([])
  })
})

describe('batallas', () => {
  const standings = [
    { participant_id: 'bp1', user: 'u1', rank: 1, status: 'active', score: { completed_reps: 30, completed_rounds: 3, completed_time_seconds: 0, finished_at: null, tie_break_key: 'bp1' } },
    { participant_id: 'bp2', user: 'u9', rank: 2, status: 'active', score: { completed_reps: 10, completed_rounds: 1, completed_time_seconds: 0, finished_at: null, tie_break_key: 'bp2' } },
  ]

  it('marca ganador a quien quedó primero', async () => {
    db.rows.public_battle_finishes = [{
      id: 'bp1', user: 'u1', battle: 'b1', battle_finished_at: '2026-08-13 20:30:00.000Z',
      battle_config: { workout_template_id: 'battle_sprint_3' },
      battle_standings: standings,
    }]
    const { items } = await FEED_SOURCES.battles(ctx())
    expect(items[0].battle).toMatchObject({ outcome: 'won', rank: 1, totalParticipants: 2, templateId: 'battle_sprint_3' })
  })

  // El detalle lo sirve `/snapshot`, que solo responde a quien jugó: la tarjeta
  // de la batalla de un seguido NO debe ser pulsable para quien la mira.
  it('sabe si quien mira participó', async () => {
    db.rows.public_battle_finishes = [{
      id: 'bp2', user: 'u9', battle: 'b1', battle_finished_at: '2026-08-13 20:30:00.000Z',
      battle_config: {}, battle_standings: [{ ...standings[1], user: 'u9' }],
    }]
    const { items } = await FEED_SOURCES.battles(ctx())
    expect(items[0].battle?.viewerTookPart).toBe(false)
  })

  it('sobrevive a una batalla sin marcador congelado', async () => {
    db.rows.public_battle_finishes = [{
      id: 'bp1', user: 'u1', battle: 'b1', battle_finished_at: '2026-08-13 20:30:00.000Z',
      battle_config: null, battle_standings: null,
    }]
    const { items } = await FEED_SOURCES.battles(ctx())
    expect(items[0].battle?.outcome).toBe('unknown')
    expect(items[0].battle?.rank).toBeNull()
  })
})

describe('aislamiento entre fuentes', () => {
  // Con seis consultas en paralelo, que una caiga —regla que no casa, colección
  // sin desplegar todavía en prod, red— no puede dejar el muro en blanco.
  it('una fuente que falla devuelve su hueco vacío, no una excepción', async () => {
    db.fail.add('challenge_participants')
    await expect(FEED_SOURCES.challenges(ctx())).resolves.toEqual({ items: [], full: false })
  })

  it('marca `full` solo cuando la página vino completa', async () => {
    db.rows.public_sessions = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`, user: 'u1', workout_key: 'p1_lun', completed_at: `2026-08-09 1${i % 10}:00:00.000Z`,
    }))
    expect((await FEED_SOURCES.sessions(ctx())).full).toBe(true)

    db.rows.public_sessions = db.rows.public_sessions.slice(0, 3)
    expect((await FEED_SOURCES.sessions(ctx())).full).toBe(false)
  })
})
