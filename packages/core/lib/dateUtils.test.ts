import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import i18n from 'i18next'
import es from '../locales/es/translation.json'
import en from '../locales/en/translation.json'
import {
  setTimezone,
  getTimezone,
  toLocalDateStr,
  todayStr,
  todayStrInTz,
  daysAgoStr,
  addDays,
  startOfWeekStr,
  localHour,
  localDay,
  localMinutesSinceMidnight,
  formatTimeHHmm,
  localHMFromPB,
  utcToLocalDateStr,
  localMidnightAsUTC,
  nowLocalForPB,
  localDateForPB,
  diffDays,
  timeAgo,
  relativeDate,
} from './dateUtils'

// relativeDate/timeAgo usan i18n.t() — igual que en producción (apps/web y
// apps/mobile inicializan i18next con estos mismos JSON antes de que se use
// core), así que lo inicializamos aquí con los recursos reales para que el
// comportamiento probado sea el de verdad, no el de una key sin traducir.
beforeAll(async () => {
  await i18n.init({
    resources: { es: { translation: es }, en: { translation: en } },
    lng: 'es',
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
  })
})

afterEach(() => {
  vi.useRealTimers()
  setTimezone('UTC') // no dejar el tz de un test filtrar al siguiente
  if (i18n.language !== 'es') i18n.changeLanguage('es')
})

describe('setTimezone / getTimezone', () => {
  it('acepta un IANA tz válido', () => {
    setTimezone('America/New_York')
    expect(getTimezone()).toBe('America/New_York')
  })

  it('cae a UTC ante un tz inválido (Android "Etc/Unknown" y similares)', () => {
    setTimezone('Not/AValidZone')
    expect(getTimezone()).toBe('UTC')
  })

  it('cae a UTC ante string vacío', () => {
    setTimezone('')
    expect(getTimezone()).toBe('UTC')
  })
})

describe('toLocalDateStr', () => {
  it('formatea un Date en UTC', () => {
    setTimezone('UTC')
    expect(toLocalDateStr(new Date('2026-06-30T23:30:00Z'))).toBe('2026-06-30')
  })

  it('un instante puede caer en el día ANTERIOR según el timezone (límite de día)', () => {
    // 2026-07-01T02:30:00Z en New York (UTC-4 en julio, horario de verano)
    // son las 22:30 del 30 de junio: un día distinto al de UTC.
    setTimezone('America/New_York')
    expect(toLocalDateStr(new Date('2026-07-01T02:30:00Z'))).toBe('2026-06-30')
  })

  it('sin argumento usa "ahora" (Date por defecto)', () => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(toLocalDateStr()).toBe('2026-01-01')
  })
})

describe('todayStr / todayStrInTz', () => {
  it('respeta el tz activo, no UTC', () => {
    setTimezone('Asia/Tokyo') // UTC+9
    vi.useFakeTimers()
    // 20:00 UTC del 30/06 -> 05:00 del 1/07 en Tokio: un día por delante de UTC.
    vi.setSystemTime(new Date('2026-06-30T20:00:00Z'))
    expect(todayStr()).toBe('2026-07-01')
  })

  it('todayStrInTz permite consultar OTRO tz sin tocar el módulo-level _tz', () => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-30T20:00:00Z'))
    expect(todayStr()).toBe('2026-06-30') // el tz activo sigue siendo UTC
    expect(todayStrInTz('Asia/Tokyo')).toBe('2026-07-01') // pero se puede pedir otro
    expect(getTimezone()).toBe('UTC') // y no se mutó el estado global
  })

  it('todayStrInTz con tz inválido no lanza (fallback interno con catch)', () => {
    expect(() => todayStrInTz('Not/AZone')).not.toThrow()
    expect(todayStrInTz('Not/AZone')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('daysAgoStr', () => {
  it('0 días atrás es hoy', () => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T12:00:00Z'))
    expect(daysAgoStr(0)).toBe(todayStr())
  })

  it('cruza el límite de año (1 de enero -> 31 de diciembre anterior)', () => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    expect(daysAgoStr(1)).toBe('2025-12-31')
  })
})

describe('addDays', () => {
  it('cruza fin de mes', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('cruza fin de año', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('febrero de un año NO bisiesto tiene 28 días', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('febrero de un año bisiesto tiene 29 días', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('offset negativo retrocede (incluyendo cruce de mes)', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('offset 0 devuelve la misma fecha', () => {
    expect(addDays('2026-06-15', 0)).toBe('2026-06-15')
  })
})

describe('startOfWeekStr', () => {
  it('un miércoles retrocede al lunes de esa semana', () => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T12:00:00Z')) // miércoles
    expect(startOfWeekStr()).toBe('2026-07-06')
  })

  it('un domingo retrocede al lunes ANTERIOR, no al siguiente (semana ISO)', () => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z')) // domingo
    expect(startOfWeekStr()).toBe('2026-06-29')
  })
})

describe('localHour / localDay / localMinutesSinceMidnight', () => {
  it('convierten según el tz activo, no UTC', () => {
    setTimezone('America/New_York') // UTC-4 en julio
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T23:15:00Z')) // miércoles 23:15 UTC
    expect(localHour()).toBe(19) // 19:15 local
    expect(localMinutesSinceMidnight()).toBe(19 * 60 + 15)
    expect(localDay()).toBe(3) // sigue siendo miércoles en NY
  })

  it('un desplazamiento de tz puede cambiar el día de la semana local', () => {
    setTimezone('Asia/Tokyo') // UTC+9
    vi.useFakeTimers()
    // 20:00 UTC del domingo 5/07 -> 05:00 del lunes 6/07 en Tokio.
    vi.setSystemTime(new Date('2026-07-05T20:00:00Z'))
    expect(localDay()).toBe(1) // lunes en Tokio, aunque en UTC sigue siendo domingo (0)
  })
})

describe('formatTimeHHmm / localHMFromPB', () => {
  it('formatea un timestamp PB (espacio + Z) a HH:mm en el tz activo', () => {
    setTimezone('UTC')
    expect(formatTimeHHmm('2026-06-24 09:05:00.000Z')).toBe('09:05')
  })

  it('convierte al tz activo cuando no es UTC', () => {
    setTimezone('America/New_York') // UTC-4 en junio
    expect(formatTimeHHmm('2026-06-24 13:30:00.000Z')).toBe('09:30')
  })

  it('devuelve "" ante un timestamp inválido', () => {
    expect(formatTimeHHmm('garbage')).toBe('')
  })

  it('localHMFromPB devuelve hour/minute como strings de 2 dígitos', () => {
    setTimezone('UTC')
    expect(localHMFromPB('2026-06-24 09:05:00.000Z')).toEqual({ hour: '09', minute: '05' })
  })

  it('localHMFromPB devuelve null ante un timestamp inválido', () => {
    expect(localHMFromPB('nope')).toBeNull()
  })
})

describe('utcToLocalDateStr', () => {
  it('acepta el formato PB con espacio, no solo con "T"', () => {
    setTimezone('UTC')
    expect(utcToLocalDateStr('2026-07-01 02:30:00.000Z')).toBe('2026-07-01')
    expect(utcToLocalDateStr('2026-07-01T02:30:00.000Z')).toBe('2026-07-01')
  })

  it('cerca de medianoche, cae en el día ANTERIOR según el tz (bug histórico de fecha)', () => {
    // Este es exactamente el caso documentado en monthActivity.ts: sin esta
    // conversión, un registro de la noche anterior (hora local) aparecería
    // agrupado en el día equivocado.
    setTimezone('America/New_York')
    expect(utcToLocalDateStr('2026-07-01 02:30:00.000Z')).toBe('2026-06-30')
  })
})

describe('localMidnightAsUTC', () => {
  it('medianoche local en horario de invierno (EST, UTC-5)', () => {
    setTimezone('America/New_York')
    expect(localMidnightAsUTC('2026-01-15')).toBe('2026-01-15 05:00:00')
  })

  it('medianoche local en horario de verano (EDT, UTC-4) — sensible a DST', () => {
    setTimezone('America/New_York')
    expect(localMidnightAsUTC('2026-06-24')).toBe('2026-06-24 04:00:00')
  })

  it('sin argumento usa "hoy" en el tz activo', () => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T15:00:00Z'))
    expect(localMidnightAsUTC()).toBe('2026-05-10 00:00:00')
  })
})

describe('nowLocalForPB / localDateForPB', () => {
  it('nowLocalForPB usa la hora local, coherente con todayStr()', () => {
    setTimezone('America/New_York')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T23:15:00Z'))
    expect(nowLocalForPB()).toBe('2026-07-08 19:15:00')
  })

  it('localDateForPB agrega medianoche literal (representación local, no UTC)', () => {
    expect(localDateForPB('2026-07-08')).toBe('2026-07-08 00:00:00')
  })
})

describe('diffDays', () => {
  it('diferencia simple dentro del mismo mes', () => {
    setTimezone('UTC')
    expect(diffDays('2026-07-01', '2026-06-25')).toBe(6)
  })

  it('cruza el límite de año', () => {
    setTimezone('UTC')
    expect(diffDays('2026-01-01', '2025-12-25')).toBe(7)
  })

  it('es antisimétrica: invertir a/b invierte el signo', () => {
    setTimezone('UTC')
    expect(diffDays('2026-06-25', '2026-07-01')).toBe(-6)
  })

  it('misma fecha -> 0', () => {
    setTimezone('UTC')
    expect(diffDays('2026-07-01', '2026-07-01')).toBe(0)
  })
})

describe('timeAgo', () => {
  it('string vacío -> ""', () => {
    expect(timeAgo('')).toBe('')
  })

  it('timestamp inválido -> ""', () => {
    expect(timeAgo('garbage')).toBe('')
  })

  it('reciente (<7 días) usa el texto relativo de dayjs en el locale activo', () => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T12:00:00Z'))
    expect(timeAgo('2026-07-08 10:00:00.000Z')).toMatch(/hace/i)
  })

  it('más de 7 días atrás cae a fecha corta (no texto relativo)', () => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T12:00:00Z'))
    const result = timeAgo('2026-06-28 10:00:00.000Z')
    expect(result).not.toMatch(/hace/i)
    expect(result).toMatch(/^\d{1,2}\s/)
  })
})

describe('relativeDate', () => {
  beforeEach(() => {
    setTimezone('UTC')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T12:00:00Z')) // "hoy" fijo para todo este bloque
  })

  it('hoy -> etiqueta traducida "Hoy"', () => {
    expect(relativeDate('2026-07-08')).toBe('Hoy')
  })

  it('ayer -> etiqueta traducida "Ayer"', () => {
    expect(relativeDate(daysAgoStr(1))).toBe('Ayer')
  })

  it('entre 2 y 7 días atrás -> "Hace N días" (límites inclusive)', () => {
    expect(relativeDate(daysAgoStr(2))).toBe('Hace 2 días')
    expect(relativeDate(daysAgoStr(7))).toBe('Hace 7 días')
  })

  it('más de 7 días atrás -> fecha corta, ya no "Hace N días"', () => {
    expect(relativeDate(daysAgoStr(8))).not.toMatch(/Hace/)
    expect(relativeDate(daysAgoStr(8))).toMatch(/^\d{1,2}\s/)
  })

  it('una fecha FUTURA no entra en el rango "Hace N días" y cae a fecha corta', () => {
    // OJO: relativeDate no tiene rama para fechas futuras ("en N días"); el
    // diff da negativo, no cumple `diff >= 2 && diff <= 7`, y termina
    // mostrando la fecha corta igual que un pasado lejano.
    expect(relativeDate('2026-07-10')).not.toMatch(/Hace/)
    expect(relativeDate('2026-07-10')).toMatch(/^\d{1,2}\s/)
  })

  it('respeta el idioma activo de i18next', () => {
    i18n.changeLanguage('en')
    expect(relativeDate('2026-07-08')).toBe('Today')
    expect(relativeDate(daysAgoStr(3))).toBe('3 days ago')
  })
})
