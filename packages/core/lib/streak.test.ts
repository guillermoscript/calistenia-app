import { describe, it, expect } from 'vitest'
import {
  computeCurrentStreak, computeLongestStreak,
  computeCurrentWeeklyStreak, computeLongestWeeklyStreak, daysTrainedThisWeek,
} from './streak'

describe('computeCurrentStreak', () => {
  const TODAY = '2026-08-17'

  it('devuelve 0 sin fechas', () => {
    expect(computeCurrentStreak([], TODAY)).toBe(0)
    expect(computeCurrentStreak(new Set(), TODAY)).toBe(0)
  })

  it('cuenta 1 si solo se ha entrenado hoy', () => {
    expect(computeCurrentStreak(['2026-08-17'], TODAY)).toBe(1)
  })

  it('cuenta los días consecutivos que terminan hoy', () => {
    const dates = ['2026-08-15', '2026-08-16', '2026-08-17']
    expect(computeCurrentStreak(dates, TODAY)).toBe(3)
  })

  it('mantiene viva la racha que termina ayer (aún no se ha entrenado hoy)', () => {
    const dates = ['2026-08-14', '2026-08-15', '2026-08-16']
    expect(computeCurrentStreak(dates, TODAY)).toBe(3)
  })

  it('da la racha por rota si la última sesión es de anteayer', () => {
    const dates = ['2026-08-13', '2026-08-14', '2026-08-15']
    expect(computeCurrentStreak(dates, TODAY)).toBe(0)
  })

  it('solo cuenta el tramo final cuando hay un hueco', () => {
    // 5 días seguidos en enero + 2 días ahora: la racha activa es 2.
    const dates = [
      '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
      '2026-08-16', '2026-08-17',
    ]
    expect(computeCurrentStreak(dates, TODAY)).toBe(2)
  })

  it('no depende del orden ni de los duplicados', () => {
    const dates = ['2026-08-17', '2026-08-15', '2026-08-16', '2026-08-16']
    expect(computeCurrentStreak(dates, TODAY)).toBe(3)
  })

  it('cruza el cambio de mes', () => {
    const dates = ['2026-07-30', '2026-07-31', '2026-08-01']
    expect(computeCurrentStreak(dates, '2026-08-01')).toBe(3)
  })

  it('cruza el cambio de año', () => {
    const dates = ['2025-12-30', '2025-12-31', '2026-01-01']
    expect(computeCurrentStreak(dates, '2026-01-01')).toBe(3)
  })

  it('cuenta el 29 de febrero de un año bisiesto', () => {
    const dates = ['2028-02-28', '2028-02-29', '2028-03-01']
    expect(computeCurrentStreak(dates, '2028-03-01')).toBe(3)
  })

  it('ignora fechas futuras al mirar hacia atrás desde hoy', () => {
    const dates = ['2026-08-16', '2026-08-17', '2026-08-20']
    expect(computeCurrentStreak(dates, TODAY)).toBe(2)
  })
})

describe('computeLongestStreak', () => {
  it('devuelve 0 sin fechas', () => {
    expect(computeLongestStreak([])).toBe(0)
  })

  it('devuelve 1 con una sola fecha', () => {
    expect(computeLongestStreak(['2026-08-17'])).toBe(1)
  })

  it('se queda con el tramo más largo, no con el último', () => {
    // Justo el caso del issue: 5 días en enero pesan más que los 2 de hoy.
    const dates = [
      '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
      '2026-08-16', '2026-08-17',
    ]
    expect(computeLongestStreak(dates)).toBe(5)
  })

  it('no depende del orden ni de los duplicados', () => {
    const dates = ['2026-08-17', '2026-08-15', '2026-08-16', '2026-08-15']
    expect(computeLongestStreak(dates)).toBe(3)
  })

  it('cuenta 1 cuando ningún día es consecutivo', () => {
    expect(computeLongestStreak(['2026-08-01', '2026-08-05', '2026-08-09'])).toBe(1)
  })

  it('cruza el cambio de año', () => {
    expect(computeLongestStreak(['2025-12-31', '2026-01-01', '2026-01-02'])).toBe(3)
  })
})

describe('computeCurrentStreak con `today` inválido', () => {
  it('devuelve 0 en vez de lanzar RangeError (dayjs 1.11.22+ en Hermes daba «Invalid Date»)', () => {
    const done = new Set(['2026-08-26', '2026-08-27'])
    expect(() => computeCurrentStreak(done, 'Invalid Date')).not.toThrow()
    expect(computeCurrentStreak(done, 'Invalid Date')).toBe(0)
    expect(computeCurrentStreak(done, '')).toBe(0)
  })
})

describe('racha semanal (#801)', () => {
  // 2026-08-17 es lunes. Semanas: 08-03, 08-10, 08-17.
  const MON = '2026-08-17'
  const THU = '2026-08-20'

  it('devuelve 0 sin fechas', () => {
    expect(computeCurrentWeeklyStreak([], MON)).toBe(0)
    expect(computeLongestWeeklyStreak([])).toBe(0)
  })

  it('una semana con un solo día no alcanza el objetivo', () => {
    expect(computeCurrentWeeklyStreak(['2026-08-18'], THU)).toBe(0)
  })

  it('dos días distintos en la semana cuentan 1', () => {
    expect(computeCurrentWeeklyStreak(['2026-08-17', '2026-08-19'], THU)).toBe(1)
  })

  it('varias sesiones el mismo día no cuentan como dos días', () => {
    expect(computeCurrentWeeklyStreak(['2026-08-18', '2026-08-18'], THU)).toBe(0)
  })

  it('un día de descanso entre sesiones no rompe nada', () => {
    const dates = ['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13', '2026-08-17', '2026-08-19']
    expect(computeCurrentWeeklyStreak(dates, THU)).toBe(3)
  })

  it('mantiene viva la racha el lunes, aunque la semana nueva aún no esté cumplida', () => {
    const dates = ['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13']
    expect(computeCurrentWeeklyStreak(dates, MON)).toBe(2)
    // Un entreno el lunes todavía no suma: falta el segundo día.
    expect(computeCurrentWeeklyStreak([...dates, MON], MON)).toBe(2)
  })

  it('una semana sin objetivo rompe la racha', () => {
    // 03 cumplida, 10 con un solo día, 17 en curso sin nada.
    const dates = ['2026-08-03', '2026-08-06', '2026-08-12']
    expect(computeCurrentWeeklyStreak(dates, MON)).toBe(0)
  })

  it('una semana entera sin entrenar rompe la racha', () => {
    const dates = ['2026-08-03', '2026-08-06', '2026-08-17', '2026-08-18']
    expect(computeCurrentWeeklyStreak(dates, THU)).toBe(1)
  })

  it('la semana va de lunes a domingo', () => {
    // Domingo 16 y lunes 17 son semanas distintas: ninguna llega a 2 días.
    expect(computeCurrentWeeklyStreak(['2026-08-16', '2026-08-17'], THU)).toBe(0)
    // Lunes 10 y domingo 16 son la misma semana.
    expect(computeCurrentWeeklyStreak(['2026-08-10', '2026-08-16'], MON)).toBe(1)
  })

  it('cruza el cambio de año', () => {
    // La semana del lunes 2025-12-29 incluye el 2026-01-01.
    const dates = ['2025-12-22', '2025-12-24', '2025-12-29', '2026-01-01']
    expect(computeCurrentWeeklyStreak(dates, '2026-01-02')).toBe(2)
  })

  it('devuelve 0 con un hoy inválido', () => {
    expect(computeCurrentWeeklyStreak(['2026-08-17', '2026-08-18'], '')).toBe(0)
    expect(computeCurrentWeeklyStreak(['2026-08-17', '2026-08-18'], 'Invalid Date')).toBe(0)
  })

  it('la más larga recorre todo el historial', () => {
    const dates = [
      // 3 semanas seguidas en julio
      '2026-07-06', '2026-07-07', '2026-07-13', '2026-07-15', '2026-07-20', '2026-07-22',
      // hueco, y luego 1
      '2026-08-10', '2026-08-11',
    ]
    expect(computeLongestWeeklyStreak(dates)).toBe(3)
    expect(computeCurrentWeeklyStreak(dates, MON)).toBe(1)
  })

  it('daysTrainedThisWeek cuenta días distintos de la semana de hoy', () => {
    expect(daysTrainedThisWeek(['2026-08-16', '2026-08-17', '2026-08-17', '2026-08-19'], THU)).toBe(2)
  })
})
