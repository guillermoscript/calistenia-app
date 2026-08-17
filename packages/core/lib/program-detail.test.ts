/**
 * Tests de la lógica pura del detalle de programa (#473).
 */

import { describe, it, expect } from 'vitest'
import { buildProgramDayRows, refineDiscipline, toProgramMeta } from './program-detail'
import type { ProgramDaySourceRow } from './program-detail'

describe('toProgramMeta', () => {
  it('localiza nombre y descripción con el locale pedido', () => {
    const meta = toProgramMeta(
      {
        id: 'p1',
        name: { es: 'Fuerza', en: 'Strength' },
        description: { es: 'Programa de fuerza', en: 'Strength program' },
        duration_weeks: 12,
      },
      'en',
    )
    expect(meta.name).toBe('Strength')
    expect(meta.description).toBe('Strength program')
    expect(meta.duration_weeks).toBe(12)
  })

  it('acepta los campos antiguos en texto plano', () => {
    const meta = toProgramMeta({ id: 'p1', name: 'Fuerza', description: 'Antiguo' }, 'es')
    expect(meta.name).toBe('Fuerza')
    expect(meta.description).toBe('Antiguo')
  })

  it('normaliza los booleanos ausentes a false', () => {
    const meta = toProgramMeta({ id: 'p1' }, 'es')
    expect(meta.is_official).toBe(false)
    expect(meta.is_featured).toBe(false)
  })

  it('deja como undefined los opcionales vacíos en vez de cadena vacía', () => {
    const meta = toProgramMeta({ id: 'p1', created_by: '', difficulty: '' }, 'es')
    expect(meta.created_by).toBeUndefined()
    expect(meta.difficulty).toBeUndefined()
  })

  it('conserva `days_per_week` solo si es un número', () => {
    expect(toProgramMeta({ id: 'p1', days_per_week: 4 }, 'es').days_per_week).toBe(4)
    expect(toProgramMeta({ id: 'p1' }, 'es').days_per_week).toBeUndefined()
  })

  it('sale siempre como calistenia: la disciplina real se deduce de los días', () => {
    expect(toProgramMeta({ id: 'p1' }, 'es').discipline).toBe('calistenia')
  })
})

describe('buildProgramDayRows', () => {
  const rows: ProgramDaySourceRow[] = [
    { day_id: 'lun', day_name: { es: 'Lunes', en: 'Monday' }, day_focus: { es: 'Empuje', en: 'Push' }, day_type: 'push', day_color: '#c8f542' },
    { day_id: 'lun', day_name: { es: 'Lunes', en: 'Monday' }, day_focus: { es: 'Empuje', en: 'Push' }, day_type: 'push', day_color: '#c8f542' },
    { day_id: 'mar', day_name: { es: 'Martes', en: 'Tuesday' }, day_focus: { es: 'Tirón', en: 'Pull' }, day_type: 'pull', day_color: '#42c8f5' },
  ]

  it('deduplica por día: `program_exercises` trae una fila por ejercicio', () => {
    expect(buildProgramDayRows(rows, 'es').map(d => d.dayId)).toEqual(['lun', 'mar'])
  })

  it('conserva el orden de llegada (el `sort_order` de la consulta)', () => {
    const reversed = [rows[2], rows[0]]
    expect(buildProgramDayRows(reversed, 'es').map(d => d.dayId)).toEqual(['mar', 'lun'])
  })

  it('localiza nombre y foco', () => {
    const [lunes] = buildProgramDayRows(rows, 'en')
    expect(lunes.name).toBe('Monday')
    expect(lunes.focus).toBe('Push')
  })

  it('pone un color por defecto cuando el día no trae ninguno', () => {
    const [day] = buildProgramDayRows([{ day_id: 'lun' }], 'es')
    expect(day.color).toBe('#888899')
  })

  it('no genera un día sin id', () => {
    expect(buildProgramDayRows([{ day_id: '' }], 'es')).toEqual([])
  })

  it('devuelve lista vacía sin filas', () => {
    expect(buildProgramDayRows([], 'es')).toEqual([])
  })

  it('no rellena sábado y domingo, al contrario que buildWeekDays de usePrograms', () => {
    // Diferencia deliberada: esta vista enseña solo los días que el programa
    // define. `buildWeekDays` sí añade los descansos de relleno.
    const days = buildProgramDayRows(rows, 'es')
    expect(days).toHaveLength(2)
    expect(days.some(d => d.dayId === 'sab' || d.dayId === 'dom')).toBe(false)
  })
})

describe('refineDiscipline', () => {
  const day = (dayId: string, type: string) => ({ dayId, name: dayId, focus: '', type, color: '#000' })

  it('detecta yoga cuando todos los días de entreno son yoga', () => {
    expect(refineDiscipline([day('lun', 'yoga'), day('mar', 'yoga'), day('dom', 'rest')])).toBe('yoga')
  })

  it('no lo detecta si hay algún día que no es yoga', () => {
    expect(refineDiscipline([day('lun', 'yoga'), day('mar', 'push')])).toBeNull()
  })

  it('devuelve null cuando solo hay descansos: no hay nada que deducir', () => {
    expect(refineDiscipline([day('sab', 'rest'), day('dom', 'rest')])).toBeNull()
  })

  it('devuelve null sin días', () => {
    expect(refineDiscipline([])).toBeNull()
  })
})
