import { describe, it, expect, beforeAll } from 'vitest'
import { getMealTimeLabel, parseExifDateTimeToHM, isMidnightEatenAt } from './meal-time'
import { setTimezone } from './dateUtils'

beforeAll(() => {
  // Determinismo: formatTimeHHmm (fallback a loggedAt) depende del tz configurado,
  // así que lo fijamos para que el test no dependa del tz de la máquina que corre CI.
  setTimezone('UTC')
})

describe('getMealTimeLabel', () => {
  it('usa eatenAt verbatim (sin reinterpretar tz) cuando no es el sentinel de medianoche', () => {
    expect(getMealTimeLabel({ eatenAt: '2026-07-08 14:35:00.000Z' })).toBe('14:35')
  })

  it('eatenAt de exactamente 16 caracteres también es válido (largo mínimo)', () => {
    expect(getMealTimeLabel({ eatenAt: '2026-07-08 14:35' })).toBe('14:35')
  })

  it('eatenAt "00:00" (sentinel legacy) cae a loggedAt formateado', () => {
    const label = getMealTimeLabel({
      eatenAt: '2026-07-08 00:00:00.000Z',
      loggedAt: '2026-07-08 09:15:00.000Z',
    })
    expect(label).toBe('09:15')
  })

  it('sin eatenAt → usa loggedAt', () => {
    expect(getMealTimeLabel({ loggedAt: '2026-07-08 21:05:00.000Z' })).toBe('21:05')
  })

  it('eatenAt demasiado corto (<16 chars) → cae a loggedAt', () => {
    expect(getMealTimeLabel({ eatenAt: '2026-07-08', loggedAt: '2026-07-08 08:00:00.000Z' })).toBe('08:00')
  })

  it('ni eatenAt ni loggedAt → string vacío', () => {
    expect(getMealTimeLabel({})).toBe('')
  })

  it('loggedAt inválido y sin eatenAt utilizable → string vacío', () => {
    expect(getMealTimeLabel({ loggedAt: 'no-es-una-fecha' })).toBe('')
  })

  it('eatenAt null se trata como ausente', () => {
    expect(getMealTimeLabel({ eatenAt: null, loggedAt: '2026-07-08 07:30:00.000Z' })).toBe('07:30')
  })
})

describe('parseExifDateTimeToHM', () => {
  it('formato EXIF DateTimeOriginal "YYYY:MM:DD HH:MM:SS"', () => {
    expect(parseExifDateTimeToHM('2026:07:08 14:35:00')).toEqual({ hour: '14', minute: '35' })
  })

  it('formato ISO con "T" "YYYY-MM-DDTHH:MM:SS"', () => {
    expect(parseExifDateTimeToHM('2026-07-08T14:35:00')).toEqual({ hour: '14', minute: '35' })
  })

  it('formato ISO con espacio "YYYY-MM-DD HH:MM:SS"', () => {
    expect(parseExifDateTimeToHM('2026-07-08 14:35:00')).toEqual({ hour: '14', minute: '35' })
  })

  it('rellena con ceros horas y minutos de un solo dígito', () => {
    expect(parseExifDateTimeToHM('2026-07-08 04:05:00')).toEqual({ hour: '04', minute: '05' })
  })

  it('hora fuera de rango (>23) → null', () => {
    expect(parseExifDateTimeToHM('2026-07-08 25:00:00')).toBeNull()
  })

  it('minuto fuera de rango (>59) → null', () => {
    expect(parseExifDateTimeToHM('2026-07-08 10:60:00')).toBeNull()
  })

  it('string sin match reconocible → null', () => {
    expect(parseExifDateTimeToHM('no es una fecha')).toBeNull()
  })

  it('undefined o null → null', () => {
    expect(parseExifDateTimeToHM(undefined)).toBeNull()
    expect(parseExifDateTimeToHM(null)).toBeNull()
  })
})

describe('isMidnightEatenAt', () => {
  it('detecta el sentinel "00:00"', () => {
    expect(isMidnightEatenAt('2026-07-08 00:00:00.000Z')).toBe(true)
  })

  it('hora real distinta de medianoche → false', () => {
    expect(isMidnightEatenAt('2026-07-08 14:35:00.000Z')).toBe(false)
  })

  it('undefined → false', () => {
    expect(isMidnightEatenAt(undefined)).toBe(false)
  })

  it('string demasiado corto → false', () => {
    expect(isMidnightEatenAt('2026-07-08')).toBe(false)
  })
})
