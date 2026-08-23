/**
 * Qué dice cada tarjeta del muro.
 *
 * El test que de verdad importa es el primero: el título de una sesión libre no
 * puede salir vacío. Así llegó el bug a producción — `i18n.t()` sobre la copia
 * de i18next que `packages/core` resuelve en la web (pnpm la separa por versión
 * de TypeScript) devuelve `undefined`, no la clave, y el muro pintaba el bloque
 * de toda sesión libre sin nombre.
 *
 * El mock de i18next de abajo reproduce el caso "sin traducción": devuelve la
 * clave. `tr()` lo trata como texto no válido y cae al respaldo, así que las
 * aserciones comprueban el PEOR caso, no el bonito.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('i18next', () => ({
  default: {
    t: (key: string) => key,
    language: 'es',
  },
}))

import { capitalizeFirst, describeFeedItem, feedItemTarget } from './feed-item'
import { NO_PHASE } from './session-key'
import type { FeedItem } from '../types/feed'

function item(overrides: Partial<FeedItem>): FeedItem {
  return {
    id: 'x1',
    type: 'workout',
    userId: 'u1',
    displayName: 'Ana',
    avatarUrl: null,
    completedAt: '2026-08-09T16:58:12.000Z',
    date: '2026-08-09',
    cursor: '2026-08-09 16:58:12.000Z',
    workoutKey: '',
    workoutTitle: '',
    phase: NO_PHASE,
    exerciseNames: [],
    durationSeconds: null,
    note: '',
    ...overrides,
  }
}

describe('describeFeedItem · sesiones de fuerza', () => {
  it('nunca deja el título vacío en una sesión libre (la regresión de la web)', () => {
    const view = describeFeedItem(item({
      workoutKey: 'free_1783000000',
      workoutTitle: 'Sesión Libre',
      phase: NO_PHASE,
    }))
    expect(view.title).toBe('Sesión Libre')
    expect(view.title).not.toBe('')
    expect(view.action).toBeTruthy()
    expect(view.verb).toBeTruthy()
  })

  /**
   * Visto en el muro con datos reales: una sesión de marzo con
   * `workout_key = 'lun'` salía como "completó una sesión libre" y de título la
   * clave cruda. No trae fase, pero de libre no tiene nada.
   */
  it('no llama sesión libre a una clave antigua que solo es el día', () => {
    const view = describeFeedItem(item({ workoutKey: 'lun', phase: NO_PHASE }))
    expect(view.action).toBe('completó un entrenamiento')
    expect(view.title).toBe('lun')
    expect(view.title).not.toContain('_')
  })

  it('cuenta QUÉ se entrenó en una sesión libre, no solo que hubo una', () => {
    const view = describeFeedItem(item({
      workoutKey: 'free_1',
      workoutTitle: 'Sesión Libre',
      exerciseNames: ['Flexiones', 'Plank', 'Dips', 'Sentadillas', 'Remo'],
      durationSeconds: 2520,
    }))
    // Solo se nombran tres; el resto se resume.
    expect(view.detail).toBe('Flexiones · Plank · Dips +2')
    expect(view.metrics).toContain('42:00')
  })

  it('no inventa un "+N" cuando caben todos los ejercicios', () => {
    const view = describeFeedItem(item({ exerciseNames: ['Flexiones', 'Plank'] }))
    expect(view.detail).toBe('Flexiones · Plank')
  })

  it('sin ejercicios cronometrados no pinta una línea vacía', () => {
    const view = describeFeedItem(item({ workoutTitle: 'Fase 1 · lun', phase: 1 }))
    expect(view.detail).toBeNull()
    expect(view.metrics).toBeNull()
  })

  // El 0 de una sesión libre es un valor legítimo (#376). Si el acento saliera
  // de PHASE_COLORS, una sesión libre se pintaría del lima del programa y sería
  // indistinguible de un día de plan.
  it('distingue por color la sesión libre de la de programa', () => {
    const free = describeFeedItem(item({ phase: NO_PHASE }))
    const program = describeFeedItem(item({ phase: 1 }))
    expect(free.accent.border).not.toBe(program.accent.border)
    expect(free.badge).toBeNull()
    expect(program.badge).toBeTruthy()
  })

  // El título venía ya resuelto dentro del `FeedItem` que cachea react-query, así
  // que cambiar el idioma dejaba el muro entero con los títulos del idioma
  // anterior hasta que caducaba la caché. Resolverlo al pintar lo arregla.
  it('resuelve el título desde la clave, no desde el que trae cacheado el item', () => {
    const view = describeFeedItem(item({
      workoutKey: 'free_1',
      workoutTitle: 'TÍTULO RANCIO DE LA CACHÉ',
    }))
    expect(view.title).toBe('Sesión Libre')
  })

  it('no se rompe con una fase fuera del catálogo de colores', () => {
    const view = describeFeedItem(item({ phase: 99 }))
    expect(view.accent.border).toBeTruthy()
    expect(view.accent.text).toBeTruthy()
  })
})

describe('describeFeedItem · cardio', () => {
  it('compone distancia, duración y ritmo', () => {
    const view = describeFeedItem(item({
      type: 'cardio',
      cardio: { activityType: 'running', distanceKm: 5.2, durationSeconds: 1723, avgPace: 5.5 },
    }))
    expect(view.title).toBe('Carrera')
    expect(view.metrics).toBe('5.20 km · 28:43 · 5:30 /km')
  })

  it('se salta las métricas que la sesión no midió', () => {
    const view = describeFeedItem(item({
      type: 'cardio',
      cardio: { activityType: 'walking', distanceKm: null, durationSeconds: 600, avgPace: 0 },
    }))
    expect(view.metrics).toBe('10:00')
  })

  it('sin ninguna métrica no deja una línea de separadores sueltos', () => {
    const view = describeFeedItem(item({
      type: 'cardio',
      cardio: { activityType: 'cycling', distanceKm: null, durationSeconds: null, avgPace: null },
    }))
    expect(view.metrics).toBeNull()
  })

  // Una fila escrita por un cliente más nuevo con un tipo que este build no
  // conoce: mejor "Rowing" que una tarjeta sin título.
  it('humaniza un tipo de actividad desconocido', () => {
    const view = describeFeedItem(item({
      type: 'cardio',
      cardio: { activityType: 'rowing', distanceKm: null, durationSeconds: null, avgPace: null },
    }))
    expect(view.title).toBe('Rowing')
  })

  it('cae a una etiqueta genérica si el tipo viene vacío', () => {
    const view = describeFeedItem(item({
      type: 'cardio',
      cardio: { activityType: '', distanceKm: null, durationSeconds: null, avgPace: null },
    }))
    expect(view.title).toBe('Cardio')
  })
})

describe('describeFeedItem · circuitos', () => {
  const circuit = (over: Partial<NonNullable<FeedItem['circuit']>> = {}) => item({
    type: 'circuit',
    circuit: {
      name: { es: 'Tabata torso', en: 'Upper Tabata' },
      mode: 'circuit',
      roundsCompleted: 5,
      roundsTarget: 5,
      durationSeconds: 1200,
      ...over,
    },
  })

  it('usa el nombre localizado del circuito', () => {
    expect(describeFeedItem(circuit()).title).toBe('Tabata torso')
  })

  it('no finge que un circuito abandonado cumplió el objetivo', () => {
    expect(describeFeedItem(circuit({ roundsCompleted: 2 })).badge).toBe('2/5 rondas')
    expect(describeFeedItem(circuit()).badge).toBeNull()
  })

  it('cae a una etiqueta genérica cuando el circuito no tiene nombre', () => {
    expect(describeFeedItem(circuit({ name: null })).title).toBe('Circuito')
  })
})

describe('describeFeedItem · retos', () => {
  const challenge = (role: 'joined' | 'created') => item({
    type: 'challenge',
    challenge: {
      challengeId: 'c1',
      title: '100 flexiones al día',
      metricLabel: 'Flexiones',
      goal: 3000,
      startsAt: '2026-08-01',
      endsAt: '2026-08-31',
      status: 'active',
      role,
    },
  })

  it('distingue crear un reto de apuntarse a uno', () => {
    expect(describeFeedItem(challenge('created')).action)
      .not.toBe(describeFeedItem(challenge('joined')).action)
    expect(describeFeedItem(challenge('created')).verb)
      .not.toBe(describeFeedItem(challenge('joined')).verb)
  })

  it('enseña la métrica y el objetivo', () => {
    const view = describeFeedItem(challenge('joined'))
    expect(view.title).toBe('100 flexiones al día')
    expect(view.detail).toBe('Flexiones')
    expect(view.metrics).toBe('Objetivo: 3000')
  })

  it('un reto sin objetivo no pinta "Objetivo: 0"', () => {
    const base = challenge('joined')
    const view = describeFeedItem({ ...base, challenge: { ...base.challenge!, goal: 0 } })
    expect(view.metrics).toBeNull()
  })
})

describe('describeFeedItem · carreras', () => {
  const race = (rank: number | null, total = 4) => item({
    type: 'race',
    race: {
      raceId: 'r1',
      name: '10K de barrio',
      activityType: 'running',
      status: 'finished',
      targetDistanceKm: 10,
      distanceKm: 10.02,
      durationSeconds: 2892,
      avgPace: 4.81,
      rank,
      totalParticipants: total,
    },
  })

  it('pone medalla en el podio', () => {
    expect(describeFeedItem(race(1)).badge).toContain('🥇')
    expect(describeFeedItem(race(3)).badge).toContain('🥉')
  })

  it('a partir del cuarto puesto usa el número, no una medalla vacía', () => {
    const badge = describeFeedItem(race(4)).badge
    expect(badge).toBe('4º de 4')
  })

  it('sin puesto resuelto no inventa una posición', () => {
    expect(describeFeedItem(race(null)).badge).toBeNull()
  })
})

describe('describeFeedItem · batallas', () => {
  const battle = (outcome: 'won' | 'lost', templateId = 'battle_sprint_3') => item({
    type: 'battle',
    battle: { battleId: 'b1', templateId, rank: outcome === 'won' ? 1 : 2, totalParticipants: 2, outcome, viewerTookPart: true },
  })

  it('resuelve el nombre del preset de batalla', () => {
    expect(describeFeedItem(battle('won')).title).toBe('Sprint 3 rondas')
  })

  it('dice "ganó" solo cuando ganó', () => {
    expect(describeFeedItem(battle('won')).verb).not.toBe(describeFeedItem(battle('lost')).verb)
  })

  // Una batalla creada por un cliente más nuevo con un preset que este build no
  // trae: la tarjeta sigue diciendo algo.
  it('sobrevive a un preset desconocido', () => {
    const view = describeFeedItem(battle('lost', 'battle_del_futuro'))
    expect(view.title).toBe('Batalla')
    expect(view.detail).toBeNull()
  })
})

describe('describeFeedItem · robustez', () => {
  // El muro es la pantalla con más papeletas de recibir filas de una versión
  // futura de la app. Un tipo desconocido no puede tumbar la lista entera.
  it('degrada un tipo desconocido en vez de reventar', () => {
    const view = describeFeedItem(item({ type: 'meditation' as never, workoutTitle: 'Algo' }))
    expect(view.title).toBe('Algo')
    expect(view.accent.border).toBeTruthy()
  })

  it('sobrevive a un item de su tipo pero sin su bloque de datos', () => {
    for (const type of ['cardio', 'circuit', 'challenge', 'race', 'battle'] as const) {
      const view = describeFeedItem(item({ type }))
      expect(view.title).toBeTruthy()
      expect(view.action).toBeTruthy()
    }
  })
})

describe('capitalizeFirst', () => {
  it('capitaliza la primera letra', () => {
    expect(capitalizeFirst('completó un entrenamiento')).toBe('Completó un entrenamiento')
  })

  it('respeta los acentos', () => {
    expect(capitalizeFirst('ávido')).toBe('Ávido')
  })

  // `text[0]` partiría el emoji por la mitad de su par suplente y dejaría un
  // carácter basura al principio de la frase.
  it('no parte un emoji inicial en dos', () => {
    expect(capitalizeFirst('🏃 corrió')).toBe('🏃 corrió')
  })

  it('tolera la cadena vacía', () => {
    expect(capitalizeFirst('')).toBe('')
  })
})

describe('feedItemTarget · a dónde se puede ir', () => {
  it('la sesión y el cardio de cualquiera se pueden abrir', () => {
    expect(feedItemTarget(item({ type: 'workout' }), false)).toEqual({ kind: 'workout', id: 'x1' })
    expect(feedItemTarget(item({ type: 'cardio' }), false)).toEqual({ kind: 'cardio', id: 'x1' })
  })

  // `circuit_sessions` es owner-only desde #386: el detalle del circuito de otra
  // persona sería un 404, así que la tarjeta no debe prometer destino.
  it('el circuito solo se abre si es propio', () => {
    expect(feedItemTarget(item({ type: 'circuit' }), true)).toEqual({ kind: 'circuit', id: 'x1' })
    expect(feedItemTarget(item({ type: 'circuit' }), false)).toBeNull()
  })

  // El detalle de una batalla lo sirve `/snapshot`, que solo responde a quien
  // jugó — ni siquiera al dueño del post si eres tú quien mira desde fuera.
  it('la batalla solo se abre si quien mira jugó', () => {
    const played = item({ type: 'battle', battle: { battleId: 'b1', templateId: 't', rank: 1, totalParticipants: 2, outcome: 'won', viewerTookPart: true } })
    const watched = item({ type: 'battle', battle: { ...played.battle!, viewerTookPart: false } })
    expect(feedItemTarget(played, false)).toEqual({ kind: 'battle', id: 'b1' })
    expect(feedItemTarget(watched, false)).toBeNull()
  })

  it('reto y carrera apuntan a SU registro, no al del muro', () => {
    const challengeItem = item({ type: 'challenge', challenge: { challengeId: 'c9', title: 'x', metricLabel: '', goal: 0, startsAt: '', endsAt: '', status: '', role: 'joined' } })
    expect(feedItemTarget(challengeItem, false)).toEqual({ kind: 'challenge', id: 'c9' })
  })

  it('sin bloque de datos no hay destino que abrir', () => {
    expect(feedItemTarget(item({ type: 'challenge' }), false)).toBeNull()
    expect(feedItemTarget(item({ type: 'race' }), false)).toBeNull()
  })
})
