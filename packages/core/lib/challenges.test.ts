import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import i18n from 'i18next'
import { getMetricUnit, getMetricLabel, daysRemaining, RANK_MEDALS } from './challenges'
import es from '../locales/es/translation.json'
import en from '../locales/en/translation.json'

// daysRemaining sale por i18n.t(); lo inicializamos con los recursos reales para
// probar la copia que ve el usuario, no una key sin traducir.
beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.init({
      resources: { es: { translation: es }, en: { translation: en } },
      lng: 'es',
      fallbackLng: 'es',
      interpolation: { escapeValue: false },
    })
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getMetricUnit', () => {
  it('scores rep exercises in reps', () => {
    expect(getMetricUnit('exercise', 'pushup_std')).toBe('reps')
  })

  it('scores timer exercises in seconds', () => {
    expect(getMetricUnit('exercise', 'plank')).toBe('s')
  })

  it('falls back to reps for unknown slugs', () => {
    expect(getMetricUnit('exercise', 'not_a_real_exercise')).toBe('reps')
    expect(getMetricUnit('exercise')).toBe('reps')
  })

  it('keeps legacy metric units', () => {
    expect(getMetricUnit('custom')).toBe('')
    expect(getMetricUnit('most_pullups')).toBe('reps')
    expect(getMetricUnit('most_lsit')).toBe('s')
  })

  it('scores cumulative metrics (#352)', () => {
    expect(getMetricUnit('total_distance')).toBe('km')
    expect(getMetricUnit('total_workouts')).toBe('')
    expect(getMetricUnit('total_exercise', 'pushup_std')).toBe('reps')
  })
})

describe('getMetricLabel (exercise)', () => {
  it('uses the catalog exercise name for known slugs', () => {
    const label = getMetricLabel('exercise', undefined, 'pushup_std')
    expect(label.length).toBeGreaterThan(0)
    expect(label).not.toBe('challenge.metricExercise')
  })

  it('keeps custom metric override', () => {
    expect(getMetricLabel('custom', 'Km corridos')).toBe('Km corridos')
  })
})

describe('daysRemaining', () => {
  // Un reto que aún no ha empezado decía "N días restantes" contando hasta su
  // final, como si ya estuviera en marcha (#381: se ve al lado del rango de
  // fechas, y las dos cosas se contradicen).
  it('anuncia el arranque cuando el reto todavía no ha empezado', () => {
    vi.setSystemTime(new Date('2026-08-13T19:00:00Z'))
    const label = daysRemaining('2026-09-05T00:00:00Z', '2026-08-30T00:00:00Z')
    expect(label).toContain('17')
    expect(label).toBe(i18n.t('challenge.startsInDays', { count: 17 }))
  })

  it('trata el día previo como mañana, sin número', () => {
    vi.setSystemTime(new Date('2026-08-29T10:00:00Z'))
    expect(daysRemaining('2026-09-05T00:00:00Z', '2026-08-30T00:00:00Z')).toBe(
      i18n.t('challenge.startsTomorrow'),
    )
  })

  it('cuenta hasta el final en cuanto el reto arranca', () => {
    vi.setSystemTime(new Date('2026-08-30T12:00:00Z'))
    expect(daysRemaining('2026-09-05T00:00:00Z', '2026-08-30T00:00:00Z')).toBe(
      i18n.t('challenge.daysLeft', { count: 6 }),
    )
  })

  it('sigue funcionando sin starts_at (los llamantes viejos no cambian)', () => {
    vi.setSystemTime(new Date('2026-08-13T19:00:00Z'))
    expect(daysRemaining('2026-08-23T00:00:00Z')).toBe(i18n.t('challenge.daysLeft', { count: 10 }))
    expect(daysRemaining('2026-08-01T00:00:00Z')).toBe(i18n.t('challenge.finished'))
  })

  it('un reto terminado no anuncia arranque aunque le pases starts_at', () => {
    vi.setSystemTime(new Date('2026-08-13T19:00:00Z'))
    expect(daysRemaining('2026-08-01T00:00:00Z', '2026-07-02T00:00:00Z')).toBe(
      i18n.t('challenge.finished'),
    )
  })
})

/**
 * #455: la constante estaba duplicada en seis ficheros y en dos de ellos los
 * emoji se habían perdido (`['', '', '']`), así que las medallas no se pintaban.
 * Ni el typecheck ni el lint distinguen '🥇' de '', y por eso esto se comprueba
 * byte a byte aquí, en el único sitio donde vive ya la constante.
 */
describe('RANK_MEDALS', () => {
  it('son los tres emoji de medalla, en orden', () => {
    expect(RANK_MEDALS).toEqual(['🥇', '🥈', '🥉'])
  })

  it('no tiene cuarto puesto: a partir del cuarto la UI cae al número', () => {
    expect(RANK_MEDALS[3]).toBeUndefined()
  })
})
