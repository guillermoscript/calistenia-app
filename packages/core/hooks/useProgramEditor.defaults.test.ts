/**
 * Los defaults del editor de programas se resuelven TARDE (#615).
 *
 * Va en fichero propio, y no en `useProgramEditor.test.ts`, por el mismo motivo
 * que `useProgramEditor.catalog.test.ts`: ese fichero lo está creando el PR #630
 * (#610), todavía abierto, y dos ramas añadiendo el mismo fichero chocarían.
 *
 * ## Qué se protege
 *
 * `DEFAULT_PHASES` y `DAY_DEFAULTS` eran constantes de módulo con el texto ya
 * resuelto: cuatro nombres de fase en español a pelo y dos días que llamaban a
 * `i18n.t('day.saturday')` en el top-level. Ese `t()` corre al IMPORTAR el
 * módulo, antes de que i18next esté inicializado, y entonces no devuelve la
 * traducción (misma familia que #588). Peor: una constante de módulo se evalúa
 * una sola vez, así que el valor malo se congela para toda la vida del proceso
 * y cambiar de idioma después tampoco lo arregla.
 *
 * El orden de este fichero es parte del test. Se importa el hook ANTES de
 * inicializar i18next, exactamente como pasa en la app real. Si alguien vuelve
 * a mover la resolución al top-level, el import de aquí arriba la ejecutará
 * sobre un i18next vacío y las aserciones de abajo caerán.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import i18n from 'i18next'

// Importar el hook arrastra `lib/pocketbase`, que en el arranque pide un
// `initCore()` que en Node no existe. El stub solo sirve para que el módulo se
// pueda importar: nada de lo que se ejercita aquí toca la red.
vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})), authStore: { record: null } },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

// ⚠️ Este import ocurre con i18next SIN inicializar, a propósito. Ver cabecera.
import { defaultPhases, dayDefaults } from './useProgramEditor'

import es from '../locales/es/translation.json'
import en from '../locales/en/translation.json'

beforeAll(async () => {
  await i18n.init({
    lng: 'es',
    fallbackLng: 'es',
    resources: {
      es: { translation: es as Record<string, string> },
      en: { translation: en as Record<string, string> },
    },
    interpolation: { escapeValue: false },
  })
})

/** Un texto sin resolver: la clave cruda, vacío o `undefined`. */
function isUnresolved(value: unknown): boolean {
  return value === undefined || value === null || value === '' || /^[a-z]+\.[a-zA-Z]/.test(String(value))
}

describe('defaultPhases', () => {
  it('devuelve las cuatro fases con el nombre traducido', () => {
    const phases = defaultPhases()

    expect(phases).toHaveLength(4)
    expect(phases.map(p => p.name)).toEqual([
      'Base & Activación',
      'Fuerza Fundamental',
      'Intensidad & Skills',
      'Peak & Consolidación',
    ])
  })

  it('conserva semanas y colores, que no dependen del idioma', () => {
    const phases = defaultPhases()

    expect(phases.map(p => p.weeks)).toEqual(['1-6', '7-13', '14-20', '21-26'])
    for (const phase of phases) {
      expect(phase.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(phase.bgColor).toMatch(/^rgba\(/)
    }
  })

  it('ninguna fase sale con la clave i18n en crudo', () => {
    for (const phase of defaultPhases()) {
      expect(isUnresolved(phase.name)).toBe(false)
    }
  })
})

describe('dayDefaults', () => {
  it('devuelve los siete días con nombre y foco traducidos', () => {
    const days = dayDefaults()

    expect(days).toHaveLength(7)
    expect(days.map(d => d.dayId)).toEqual(['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'])
    expect(days.map(d => d.dayName)).toEqual([
      'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo',
    ])
  })

  it('sábado y domingo salen traducidos — eran los que rompía el t() del top-level', () => {
    const days = dayDefaults()
    const sab = days.find(d => d.dayId === 'sab')!
    const dom = days.find(d => d.dayId === 'dom')!

    expect(sab.dayName).toBe('Sábado')
    expect(sab.focus).toBe('Caminata activa')
    expect(dom.dayName).toBe('Domingo')
    expect(dom.focus).toBe('Descanso total')
  })

  it('ningún día sale con la clave i18n en crudo ni vacío', () => {
    for (const day of dayDefaults()) {
      expect(isUnresolved(day.dayName), `dayName de ${day.dayId}`).toBe(false)
      expect(isUnresolved(day.focus), `focus de ${day.dayId}`).toBe(false)
    }
  })

  it('mantiene tipo y color, que no dependen del idioma', () => {
    const days = dayDefaults()

    expect(days.map(d => d.type)).toEqual(['push', 'pull', 'lumbar', 'legs', 'full', 'rest', 'rest'])
    for (const day of days) {
      expect(day.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

/**
 * La prueba de fuego. Una constante de módulo con el texto ya resuelto no puede
 * cambiar de idioma pase lo que pase: se evaluó una vez y ahí se quedó. Que
 * estos valores sigan al idioma es lo que demuestra que se resuelven en cada
 * llamada, no al importar.
 */
describe('resolución tardía', () => {
  it('cambiar de idioma cambia el texto de fases y días', async () => {
    const beforeEs = { phase: defaultPhases()[0].name, day: dayDefaults()[0].dayName }

    await i18n.changeLanguage('en')
    const afterEn = { phase: defaultPhases()[0].name, day: dayDefaults()[0].dayName }

    await i18n.changeLanguage('es')
    const backToEs = { phase: defaultPhases()[0].name, day: dayDefaults()[0].dayName }

    expect(beforeEs).toEqual({ phase: 'Base & Activación', day: 'Lunes' })
    expect(afterEn).toEqual({ phase: 'Base & Activation', day: 'Monday' })
    expect(backToEs).toEqual(beforeEs)
  })
})
