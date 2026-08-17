/**
 * Tests de la lógica pura del perfil público (#473).
 *
 * La zona horaria se fija a UTC: `buildMonthActivity` deriva el día local de un
 * instante UTC, así que sin fijarla los resultados cambiarían según la máquina.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { setTimezone } from './dateUtils'
import {
  buildMonthActivity,
  daysInMonth,
  mapProfilePRs,
  mapRecentSessions,
  profileDisplayName,
  RECENT_SESSIONS_LIMIT,
} from './public-profile'
import type { PublicSessionRow } from './public-profile'

beforeAll(() => {
  setTimezone('UTC')
})

describe('daysInMonth', () => {
  it('cuenta los días de meses de distinta longitud', () => {
    expect(daysInMonth('2026-01')).toBe(31)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-02')).toBe(28)
  })

  it('acierta en febrero de un año bisiesto', () => {
    expect(daysInMonth('2024-02')).toBe(29)
  })
})

describe('buildMonthActivity', () => {
  it('devuelve el mes entero a false cuando no hay sesiones', () => {
    const activity = buildMonthActivity('2026-04', [])
    expect(Object.keys(activity)).toHaveLength(30)
    expect(activity['2026-04-01']).toBe(false)
    expect(activity['2026-04-30']).toBe(false)
    expect(Object.values(activity).every(v => v === false)).toBe(true)
  })

  it('marca solo los días con sesión', () => {
    const activity = buildMonthActivity('2026-04', [
      { id: 's1', completed_at: '2026-04-03 10:00:00' },
      { id: 's2', completed_at: '2026-04-17 18:30:00' },
    ])
    expect(activity['2026-04-03']).toBe(true)
    expect(activity['2026-04-17']).toBe(true)
    expect(activity['2026-04-04']).toBe(false)
  })

  it('cae a `created` cuando la sesión no tiene `completed_at`', () => {
    const activity = buildMonthActivity('2026-04', [{ id: 's1', created: '2026-04-09 08:00:00' }])
    expect(activity['2026-04-09']).toBe(true)
  })

  it('ignora sesiones de otro mes en vez de inventarles una clave', () => {
    const activity = buildMonthActivity('2026-04', [
      { id: 's1', completed_at: '2026-03-31 22:00:00' },
      { id: 's2', completed_at: '2026-05-01 06:00:00' },
    ])
    expect(Object.keys(activity)).toHaveLength(30)
    expect(Object.values(activity).every(v => v === false)).toBe(true)
    expect(activity['2026-03-31']).toBeUndefined()
  })

  it('no se rompe con sesiones sin ninguna fecha', () => {
    const activity = buildMonthActivity('2026-04', [{ id: 's1' }])
    expect(Object.values(activity).every(v => v === false)).toBe(true)
  })

  it('marca el día una vez aunque haya varias sesiones ese día', () => {
    const activity = buildMonthActivity('2026-04', [
      { id: 's1', completed_at: '2026-04-05 09:00:00' },
      { id: 's2', completed_at: '2026-04-05 19:00:00' },
    ])
    expect(activity['2026-04-05']).toBe(true)
  })
})

describe('mapRecentSessions', () => {
  it('ordena de más reciente a más antigua', () => {
    const sessions: PublicSessionRow[] = [
      { id: 'vieja', completed_at: '2026-04-01 10:00:00' },
      { id: 'nueva', completed_at: '2026-04-20 10:00:00' },
      { id: 'media', completed_at: '2026-04-10 10:00:00' },
    ]
    expect(mapRecentSessions(sessions).map(s => s.id)).toEqual(['nueva', 'media', 'vieja'])
  })

  it('ordena bien las sesiones antiguas que solo tienen `created`', () => {
    // El servidor ordena por `completed_at`, así que este fallback solo lo
    // resuelve el cliente: es la razón de reordenar aquí.
    const sessions: PublicSessionRow[] = [
      { id: 'sin-completed', created: '2026-04-25 10:00:00' },
      { id: 'con-completed', completed_at: '2026-04-10 10:00:00' },
    ]
    expect(mapRecentSessions(sessions).map(s => s.id)).toEqual(['sin-completed', 'con-completed'])
  })

  it('descarta las sesiones sin fecha alguna', () => {
    const sessions: PublicSessionRow[] = [{ id: 'sin-fecha' }, { id: 'ok', completed_at: '2026-04-10 10:00:00' }]
    expect(mapRecentSessions(sessions).map(s => s.id)).toEqual(['ok'])
  })

  it('corta en el tope por defecto', () => {
    const sessions: PublicSessionRow[] = Array.from({ length: 25 }, (_, i) => ({
      id: `s${i}`,
      completed_at: `2026-04-${String(i + 1).padStart(2, '0')} 10:00:00`,
    }))
    expect(mapRecentSessions(sessions)).toHaveLength(RECENT_SESSIONS_LIMIT)
  })

  it('respeta un tope explícito', () => {
    const sessions: PublicSessionRow[] = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      completed_at: `2026-04-0${i + 1} 10:00:00`,
    }))
    expect(mapRecentSessions(sessions, 2)).toHaveLength(2)
  })

  it('conserva la fase 0 de una sesión libre en vez de degradarla a 1 (#376)', () => {
    const [session] = mapRecentSessions([
      { id: 's1', workout_key: 'free_1783000000', phase: 0, completed_at: '2026-04-10 10:00:00' },
    ])
    expect(session.phase).toBe(0)
  })

  it('da fase 1 por defecto a una sesión de programa sin fase', () => {
    const [session] = mapRecentSessions([
      { id: 's1', workout_key: 'p2_lun', completed_at: '2026-04-10 10:00:00' },
    ])
    expect(session.phase).toBe(1)
  })

  it('respeta la fase declarada de una sesión de programa', () => {
    const [session] = mapRecentSessions([
      { id: 's1', workout_key: 'p3_mar', phase: 3, completed_at: '2026-04-10 10:00:00' },
    ])
    expect(session.phase).toBe(3)
  })

  it('nunca deja la clave cruda como título de una sesión libre (#376)', () => {
    const [session] = mapRecentSessions([
      { id: 's1', workout_key: 'free_1783000000', completed_at: '2026-04-10 10:00:00' },
    ])
    expect(session.workoutTitle).not.toBe('free_1783000000')
    expect(session.workoutTitle).toBeTruthy()
  })

  it('devuelve el título sin localizar, para que lo traduzca quien lo pinta', () => {
    // Un workout de programa trae su título como campo traducible; el hook no
    // debe aplanarlo, porque localizar dentro de la carga era lo que hacía que
    // cambiar de idioma relanzara las peticiones.
    const [session] = mapRecentSessions([
      { id: 's1', workout_key: 'p1_lun', completed_at: '2026-04-10 10:00:00' },
    ])
    expect(session.workoutTitle).toBeDefined()
  })

  it('normaliza la nota ausente a cadena vacía', () => {
    const [session] = mapRecentSessions([{ id: 's1', completed_at: '2026-04-10 10:00:00' }])
    expect(session.note).toBe('')
  })

  it('deja `completedAt` con el valor usable para ordenar y pintar', () => {
    const [session] = mapRecentSessions([{ id: 's1', created: '2026-04-10 10:00:00' }])
    expect(session.completedAt).toBe('2026-04-10 10:00:00')
  })
})

describe('profileDisplayName', () => {
  it('prefiere el nombre visible', () => {
    expect(profileDisplayName({ display_name: 'Guille', email: 'g@x.test' })).toBe('Guille')
  })

  it('cae a la parte local del correo', () => {
    expect(profileDisplayName({ email: 'guille@x.test' })).toBe('guille')
  })

  it('devuelve cadena vacía si no hay nada', () => {
    expect(profileDisplayName({})).toBe('')
  })
})

describe('mapProfilePRs', () => {
  it('rellena con ceros cuando el usuario no tiene fila de PRs', () => {
    expect(mapProfilePRs({})).toEqual({
      pr_pullups: 0,
      pr_pushups: 0,
      pr_lsit: 0,
      pr_pistol: 0,
      pr_handstand: 0,
    })
  })

  it('conserva los valores presentes', () => {
    expect(mapProfilePRs({ pr_pullups: 12, pr_lsit: 30 })).toMatchObject({
      pr_pullups: 12,
      pr_lsit: 30,
      pr_pushups: 0,
    })
  })
})
