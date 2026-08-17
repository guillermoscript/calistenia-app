/**
 * Tests de `usePublicProfile` y `useRoutineView` (issue #473).
 *
 * Los hooks viven en `packages/core`, pero los tests de core corren en node sin
 * testing-library: no se pueden montar allí. Aquí sí —web tiene jsdom— y este es
 * el único sitio donde se pueden afirmar las dos cosas que pedía el issue:
 *
 *  1. que las consultas salgan en UNA sola ola y no en cascada, y
 *  2. que cambiar de idioma NO vuelva a pedir nada.
 *
 * La prueba del paralelismo se apoya en dejar todas las respuestas pendientes:
 * si el hook pidiera en cascada, solo se registraría la primera llamada, porque
 * las siguientes estarían esperando a que resolviera.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

const h = vi.hoisted(() => {
  const state = {
    calls: [] as string[],
    pending: [] as (() => void)[],
    data: {} as Record<string, unknown>,
  }

  /** Registra la llamada y la deja pendiente hasta que el test la libere. */
  const respond = (key: string) => {
    state.calls.push(key)
    return new Promise((resolve, reject) => {
      state.pending.push(() => {
        if (key in state.data) resolve(state.data[key])
        else reject(Object.assign(new Error(`sin dato para ${key}`), { status: 404 }))
      })
    })
  }

  return { state, respond }
})

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    baseUrl: 'http://pb.test',
    filter: (expr: string) => expr,
    collection: (name: string) => ({
      getOne: () => h.respond(`${name}.getOne`),
      getFirstListItem: () => h.respond(`${name}.getFirstListItem`),
      getList: () => h.respond(`${name}.getList`),
      getFullList: () => h.respond(`${name}.getFullList`),
    }),
  },
  getUserAvatarUrl: () => null,
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

import { usePublicProfile } from '@calistenia/core/hooks/usePublicProfile'
import { useRoutineView } from '@calistenia/core/hooks/useRoutineView'
import { localize } from '@calistenia/core/lib/i18n-db'

/**
 * El idioma se pasa como parámetro a `localize` en lugar de cambiarlo en i18next.
 *
 * No es por comodidad: `packages/core` y `apps/web` resuelven **copias físicas
 * distintas** de `i18next` y `react-i18next` (misma versión, instancias
 * separadas por la versión de TypeScript en la clave de pnpm), así que un
 * `vi.mock('react-i18next')` hecho desde web no alcanza al `useLocalize` de
 * core. Lo que aquí importa es la propiedad de la que va el issue —pintar en
 * otro idioma no cuesta peticiones—, y eso se comprueba igual de bien
 * localizando en el render con el locale que controla el test.
 */

const USER_ID = 'user-1'

/** Libera todas las respuestas pendientes y deja correr los efectos. */
async function releaseAll() {
  await act(async () => {
    const pending = [...h.state.pending]
    h.state.pending.length = 0
    pending.forEach(fn => fn())
    await Promise.resolve()
  })
}

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  h.state.calls.length = 0
  h.state.pending.length = 0
  h.state.data = {}
})

// ─── usePublicProfile ───────────────────────────────────────────────────────

function ProfileHarness() {
  const [lang, setLang] = useState('es')
  const l = (field: Parameters<typeof localize>[0]) => localize(field, lang)
  const { profile, loading } = usePublicProfile(USER_ID)
  return (
    <div>
      <span data-testid="loading">{loading ? 'si' : 'no'}</span>
      <span data-testid="name">{profile?.displayName ?? ''}</span>
      <span data-testid="sessions">{profile?.totalSessions ?? ''}</span>
      <span data-testid="pullups">{profile?.prs.pr_pullups ?? ''}</span>
      <span data-testid="program">{profile ? l(profile.activeProgram?.name) : ''}</span>
      <span data-testid="recent">{profile?.recentSessions.length ?? ''}</span>
      <button onClick={() => setLang('en')}>en</button>
    </div>
  )
}

function seedProfile() {
  h.state.data = {
    'users.getOne': {
      id: USER_ID,
      display_name: 'Ana',
      email: 'ana@local.test',
      created: '2026-01-15 10:00:00',
    },
    'public_user_stats.getFirstListItem': {
      total_sessions: 42,
      workout_streak_best: 9,
      workout_streak_current: 3,
      level: 5,
      xp: 1200,
    },
    'public_prs.getList': { items: [{ phase: 2, pr_pullups: 12 }] },
    'public_sessions.getList': {
      items: [
        { id: 's1', workout_key: 'p1_lun', phase: 1, completed_at: '2026-08-10 18:00:00' },
        { id: 's2', workout_key: 'p1_mar', phase: 1, completed_at: '2026-08-12 18:00:00' },
      ],
    },
    'user_programs.getFirstListItem': {
      expand: { program: { id: 'prog-1', name: { es: 'Fuerza', en: 'Strength' } } },
    },
  }
}

describe('usePublicProfile', () => {
  it('lanza las cinco consultas en una sola ola, no en cascada (#473)', async () => {
    seedProfile()
    renderWithQuery(<ProfileHarness />)

    // Nada ha resuelto todavía: si el hook pidiera en cascada, aquí solo habría
    // una llamada registrada y este waitFor no se cumpliría nunca.
    await waitFor(() => expect(h.state.calls).toHaveLength(5))

    expect(new Set(h.state.calls)).toEqual(
      new Set([
        'users.getOne',
        'public_user_stats.getFirstListItem',
        'public_prs.getList',
        'public_sessions.getList',
        'user_programs.getFirstListItem',
      ]),
    )
  })

  it('compone el perfil a partir de las cinco respuestas', async () => {
    seedProfile()
    renderWithQuery(<ProfileHarness />)
    await waitFor(() => expect(h.state.calls).toHaveLength(5))
    await releaseAll()

    await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Ana'))
    expect(screen.getByTestId('sessions').textContent).toBe('42')
    expect(screen.getByTestId('pullups').textContent).toBe('12')
    expect(screen.getByTestId('recent').textContent).toBe('2')
    expect(screen.getByTestId('loading').textContent).toBe('no')
  })

  it('cambiar de idioma no vuelve a pedir nada (#473)', async () => {
    seedProfile()
    renderWithQuery(<ProfileHarness />)
    await waitFor(() => expect(h.state.calls).toHaveLength(5))
    await releaseAll()
    await waitFor(() => expect(screen.getByTestId('program').textContent).toBe('Fuerza'))

    const callsAntes = h.state.calls.length

    // El texto se traduce en el render, así que el cambio de idioma se ve...
    fireEvent.click(screen.getByText('en'))
    await waitFor(() => expect(screen.getByTestId('program').textContent).toBe('Strength'))

    // ...pero no cuesta ni una petición. Antes se localizaba dentro del efecto
    // de carga, con `l` en sus dependencias, y esto relanzaba las cinco.
    expect(h.state.calls).toHaveLength(callsAntes)
  })

  it('sigue dando perfil cuando el usuario no tiene stats, ni PRs, ni programa', async () => {
    // Solo el usuario responde; las cuatro consultas opcionales fallan.
    h.state.data = {
      'users.getOne': { id: USER_ID, display_name: 'Nuevo', email: 'n@local.test', created: '2026-08-01 10:00:00' },
    }
    renderWithQuery(<ProfileHarness />)
    await waitFor(() => expect(h.state.calls).toHaveLength(5))
    await releaseAll()

    await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Nuevo'))
    expect(screen.getByTestId('sessions').textContent).toBe('0')
    expect(screen.getByTestId('pullups').textContent).toBe('0')
    expect(screen.getByTestId('recent').textContent).toBe('0')
    expect(screen.getByTestId('program').textContent).toBe('')
  })
})

// ─── useRoutineView ────────────────────────────────────────────────────────

function RoutineHarness() {
  const l = (field: Parameters<typeof localize>[0]) => localize(field, 'es')
  const { userName, program, phaseGroups, noProgram, loading } = useRoutineView(USER_ID)
  return (
    <div>
      <span data-testid="loading">{loading ? 'si' : 'no'}</span>
      <span data-testid="user">{userName}</span>
      <span data-testid="program">{program ? l(program.name) : ''}</span>
      <span data-testid="noProgram">{noProgram ? 'si' : 'no'}</span>
      <span data-testid="phases">{phaseGroups.length}</span>
      <span data-testid="days">{phaseGroups[0]?.days.length ?? ''}</span>
      <span data-testid="muscles">
        {phaseGroups[0]?.days[0]?.exercises[0] ? l(phaseGroups[0].days[0].exercises[0].muscles) : ''}
      </span>
    </div>
  )
}

describe('useRoutineView', () => {
  it('pide el usuario y la inscripción en la misma ola', async () => {
    h.state.data = {
      'users.getOne': { id: USER_ID, display_name: 'Ana', email: 'ana@local.test' },
      'user_programs.getFirstListItem': {
        expand: { program: { id: 'prog-1', name: { es: 'Fuerza', en: 'Strength' }, duration_weeks: 12 } },
      },
    }
    renderWithQuery(<RoutineHarness />)
    await waitFor(() => expect(h.state.calls).toHaveLength(2))
    expect(new Set(h.state.calls)).toEqual(
      new Set(['users.getOne', 'user_programs.getFirstListItem']),
    )
  })

  it('pide fases y ejercicios juntos, con getFullList y no paginado', async () => {
    h.state.data = {
      'users.getOne': { id: USER_ID, display_name: 'Ana' },
      'user_programs.getFirstListItem': {
        expand: { program: { id: 'prog-1', name: 'Fuerza', duration_weeks: 12 } },
      },
      'program_phases.getFullList': [
        { id: 'ph1', phase_number: 1, name: { es: 'Fase 1', en: 'Phase 1' }, weeks: 6, sort_order: 1 },
      ],
      'program_exercises.getFullList': [
        {
          id: 'e1',
          phase_number: 1,
          day_id: 'lun',
          day_name: { es: 'Lunes', en: 'Monday' },
          day_focus: { es: 'Empuje', en: 'Push' },
          exercise_id: 'pushup',
          exercise_name: { es: 'Flexiones', en: 'Push-ups' },
          muscles: { es: 'Pecho', en: 'Chest' },
        },
      ],
    }

    renderWithQuery(<RoutineHarness />)
    await waitFor(() => expect(h.state.calls).toHaveLength(2))
    await releaseAll()

    // Segunda ola: las dos consultas del programa salen juntas.
    await waitFor(() => expect(h.state.calls).toHaveLength(4))
    expect(h.state.calls).toContain('program_phases.getFullList')
    expect(h.state.calls).toContain('program_exercises.getFullList')
    await releaseAll()

    await waitFor(() => expect(screen.getByTestId('phases').textContent).toBe('1'))
    expect(screen.getByTestId('user').textContent).toBe('Ana')
    expect(screen.getByTestId('days').textContent).toBe('1')
    expect(screen.getByTestId('muscles').textContent).toBe('Pecho')
    expect(screen.getByTestId('noProgram').textContent).toBe('no')
  })

  it('marca noProgram y no pide la rutina cuando no hay programa activo', async () => {
    h.state.data = {
      'users.getOne': { id: USER_ID, display_name: 'Ana' },
      // `user_programs` falla → sin inscripción activa.
    }
    renderWithQuery(<RoutineHarness />)
    await waitFor(() => expect(h.state.calls).toHaveLength(2))
    await releaseAll()

    await waitFor(() => expect(screen.getByTestId('noProgram').textContent).toBe('si'))
    expect(screen.getByTestId('phases').textContent).toBe('0')
    // No se piden fases ni ejercicios de un programa que no existe.
    expect(h.state.calls).toHaveLength(2)
  })
})
