/**
 * El estado inicial del editor de programas sale traducido (#615).
 *
 * El test de core (`useProgramEditor.defaults.test.ts`) prueba las funciones
 * sueltas. Este prueba el CABLEADO: monta el hook de verdad y mira lo que el
 * editor pintaría, que es donde el bug se veía. Vive en `apps/web` porque los
 * hooks de core solo se pueden montar desde aquí — es el único paquete con
 * jsdom y React configurados.
 *
 * El bug: `DEFAULT_PHASES` era español a pelo y `DAY_DEFAULTS` llamaba a
 * `i18n.t('day.saturday')` en el top-level del módulo, o sea al importarlo,
 * antes de que i18next estuviera inicializado. Sábado y domingo llegaban al
 * editor sin nombre ni foco.
 *
 * El orden importa: i18next se inicializa DESPUÉS de importar el hook, igual
 * que en la app real. Si alguien devuelve la resolución al top-level, aquí se
 * ejecutará contra un i18next vacío y el test caerá.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import i18n from 'i18next'

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    filter: vi.fn(),
    collection: vi.fn(() => ({})),
    authStore: { record: null, isValid: false, onChange: vi.fn(() => () => {}) },
  },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

// ⚠️ Import con i18next SIN inicializar, a propósito. Ver cabecera.
import { useProgramEditor } from '@calistenia/core/hooks/useProgramEditor'

import es from '@calistenia/core/locales/es/translation.json'

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.init({
      lng: 'es',
      fallbackLng: 'es',
      resources: { es: { translation: es as Record<string, string> } },
      interpolation: { escapeValue: false },
    })
  } else {
    i18n.addResourceBundle('es', 'translation', es, true, true)
    await i18n.changeLanguage('es')
  }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Un texto sin resolver: la clave cruda, vacío o `undefined`. */
const isUnresolved = (value: unknown) =>
  value === undefined || value === null || value === '' || /^[a-z]+\.[a-zA-Z]/.test(String(value))

describe('estado inicial del editor de programas', () => {
  it('arranca con las cuatro fases nombradas en español', () => {
    const { result } = renderHook(() => useProgramEditor(), { wrapper })

    expect(result.current.state.phases.map(p => p.name)).toEqual([
      'Base & Activación',
      'Fuerza Fundamental',
      'Intensidad & Skills',
      'Peak & Consolidación',
    ])
  })

  it('rellena las cuatro fases con los siete días, todos con nombre y foco', () => {
    const { result } = renderHook(() => useProgramEditor(), { wrapper })
    const days = result.current.state.days

    // 4 fases × 7 días.
    expect(Object.keys(days)).toHaveLength(28)

    for (const [key, day] of Object.entries(days)) {
      expect(isUnresolved(day.dayName), `dayName de ${key}`).toBe(false)
      expect(isUnresolved(day.focus), `focus de ${key}`).toBe(false)
    }
  })

  it('sábado y domingo llegan con nombre y foco — eran los que rompía el t() del top-level', () => {
    const { result } = renderHook(() => useProgramEditor(), { wrapper })
    const days = result.current.state.days

    expect(days['0_sab'].dayName).toBe('Sábado')
    expect(days['0_sab'].focus).toBe('Caminata activa')
    expect(days['0_dom'].dayName).toBe('Domingo')
    expect(days['0_dom'].focus).toBe('Descanso total')

    // La última fase también: el bug afectaba a todas por igual.
    expect(days['3_sab'].dayName).toBe('Sábado')
    expect(days['3_dom'].focus).toBe('Descanso total')
  })

  it('los días entre semana conservan su foco', () => {
    const { result } = renderHook(() => useProgramEditor(), { wrapper })
    const days = result.current.state.days

    expect(days['0_lun'].dayName).toBe('Lunes')
    expect(days['0_lun'].focus).toBe('Empuje + Core')
    expect(days['0_mie'].focus).toBe('Lumbar + Estiramientos')
    expect(days['0_vie'].focus).toBe('Cuerpo completo + Core')
  })
})
