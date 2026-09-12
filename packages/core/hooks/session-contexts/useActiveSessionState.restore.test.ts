/**
 * Restaurar una sesión de fuerza guardada ANTES del arreglo del #690.
 *
 * El hook no se monta aquí (core no tiene DOM ni testing-library): se ejercita
 * `loadFromStorage`, que es exactamente lo que alimenta el `useState` perezoso
 * del provider. Lo que se protege es que el snapshot congelado salga repasado
 * —nombre de catálogo y cronómetro deducido— sin que el `id` cambie nunca.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initCore } from '../../platform'
import { STRENGTH_ACTIVE_KEY } from '../../lib/storage-keys'
import { getOrLoadCatalogIndex } from '../../lib/catalogIndex'
import { localize } from '../../lib/i18n-db'

// El módulo importa `pb` al evaluarse; nada de lo que se prueba aquí sale a red.
vi.mock('../../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})), authStore: { isValid: false, onChange: vi.fn(() => () => {}) }, files: { getURL: vi.fn() } },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

// El nombre esperado se LEE del catálogo, no se escribe a mano: el contenido
// del catálogo se retoca (traducciones, #689) y un literal aquí convertiría
// este test en un guardián del copy en vez de del repaso del snapshot.
const catalogName = (id: string, locale = 'es') =>
  localize(getOrLoadCatalogIndex()?.byId.get(id)?.name, locale)

const memory = new Map<string, string>()

initCore({
  storage: {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => { memory.set(k, v) },
    removeItem: (k) => { memory.delete(k) },
  },
  env: { pbUrl: 'http://localhost:8090', aiApiUrl: '', isDev: true },
  analytics: { track: () => {}, identify: () => {}, clear: () => {} },
  connectivity: { isOnline: () => true, onOnline: () => () => {} },
})

const { loadFromStorage, normalizeRemoteSession } = await import('./useActiveSessionState')

const persist = (exercises: Record<string, unknown>[]) => {
  memory.set(STRENGTH_ACTIVE_KEY, JSON.stringify({
    workout: { phase: 1, day: 'lun', title: 'Empuje', exercises },
    workoutKey: 'p1_lun',
    source: 'program',
    progress: { stepIdx: 2, phase: 'exercise', setsCount: 4 },
    startedAt: Date.now() - 60_000,
    sectionStartTime: Date.now() - 60_000,
    savedAt: Date.now() - 1_000,
  }))
}

const base = {
  id: 'lun_1_1', name: 'Plancha lateral', sets: 3, reps: '10', rest: 90,
  muscles: 'Core', note: '', youtube: '', priority: 'med', isTimer: false, timerSeconds: 0,
}

describe('loadFromStorage — snapshot repasado al restaurar (#690)', () => {
  beforeEach(() => { memory.clear() })

  it('el slug guardado sale con el nombre del catálogo y con cronómetro', () => {
    persist([{ ...base, name: 'arm_circles', reps: '30-45 seg' }])
    const ex = loadFromStorage().session!.workout.exercises[0]
    expect(ex.name).toBe(catalogName('arm_circles'))
    expect(ex.name).not.toBe('arm_circles')
    expect(ex.isTimer).toBe(true)
    expect(ex.timerSeconds).toBe(45)
  })

  it('el `id` sobrevive intacto: el historial de series de la sesión no se parte', () => {
    persist([{ ...base, id: 'lun_1_1', name: 'arm_circles', reps: '30-45 seg' }])
    expect(loadFromStorage().session!.workout.exercises[0].id).toBe('lun_1_1')
  })

  it('el resto de la sesión (progreso, clave, origen) no se toca', () => {
    persist([{ ...base, name: 'arm_circles', reps: '30-45 seg' }])
    const s = loadFromStorage().session!
    expect(s.workoutKey).toBe('p1_lun')
    expect(s.source).toBe('program')
    expect(s.progress).toEqual({ stepIdx: 2, phase: 'exercise', setsCount: 4 })
  })

  it('un snapshot ya sano se restaura sin cambios', () => {
    persist([{ ...base, name: 'Plancha lateral', reps: '10' }])
    const ex = loadFromStorage().session!.workout.exercises[0]
    expect(ex.name).toBe('Plancha lateral')
    expect(ex.isTimer).toBe(false)
    expect(ex.timerSeconds).toBe(0)
  })

  it('una sesión de más de 24 h sigue caducando (no se repasa lo que se tira)', () => {
    memory.set(STRENGTH_ACTIVE_KEY, JSON.stringify({
      workout: { phase: 1, day: 'lun', title: 'Empuje', exercises: [{ ...base, name: 'arm_circles' }] },
      workoutKey: 'p1_lun', source: 'program',
      progress: { stepIdx: 0, phase: 'exercise', setsCount: 0 },
      startedAt: Date.now() - 25 * 60 * 60 * 1000,
      sectionStartTime: null,
    }))
    const { session, expired } = loadFromStorage()
    expect(session).toBeNull()
    expect(expired?.workoutKey).toBe('p1_lun')
    expect(memory.has(STRENGTH_ACTIVE_KEY)).toBe(false)
  })
})

describe('normalizeRemoteSession — la adopción entre dispositivos repasa igual (#690)', () => {
  const remote = (exercises: Record<string, unknown>[]) => ({
    workout: { phase: 1, day: 'lun', title: 'Empuje', exercises },
    workoutKey: 'p1_lun',
    source: 'program' as const,
    progress: { stepIdx: 2, phase: 'exercise' as const, setsCount: 4 },
    startedAt: Date.now() - 60_000,
    sectionStartTime: null,
    savedAt: Date.now() - 1_000,
    platform: 'mobile',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  it('la sesión que llega del server sale con nombre de catálogo y cronómetro', () => {
    const ex = normalizeRemoteSession(remote([{ ...base, name: 'arm_circles', reps: '30-45 seg' }])).workout.exercises[0]
    expect(ex.name).toBe(catalogName('arm_circles'))
    expect(ex.name).not.toBe('arm_circles')
    expect(ex.isTimer).toBe(true)
    expect(ex.timerSeconds).toBe(45)
    expect(ex.id).toBe('lun_1_1')
  })

  it('una sesión remota sana se adopta con LA MISMA referencia', () => {
    const r = remote([{ ...base, name: 'Plancha lateral', reps: '10' }])
    expect(normalizeRemoteSession(r)).toBe(r)
  })

  it('los metadatos de la sesión remota no se tocan', () => {
    const r = remote([{ ...base, name: 'arm_circles', reps: '45s' }])
    const out = normalizeRemoteSession(r)
    expect(out.workoutKey).toBe(r.workoutKey)
    expect(out.savedAt).toBe(r.savedAt)
    expect(out.progress).toBe(r.progress)
  })
})
