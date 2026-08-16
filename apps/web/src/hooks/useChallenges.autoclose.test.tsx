/**
 * Regresión del bucle infinito de refetch (issue #451).
 *
 * El hook vive en `packages/core`, pero los tests de core corren en node sin
 * testing-library: no se puede montar. Aquí sí — web tiene jsdom — así que este
 * es el único sitio donde se puede afirmar lo que pide el issue, que la query
 * se ejecuta UNA sola vez para un participante que no es el creador.
 *
 * Con el código anterior este test no fallaba con una aserción: el 403 del
 * update disparaba invalidate → refetch → mismos `expiredIds` → efecto → …, y
 * `getFullList` se llamaba una y otra vez hasta que la espera acotada de abajo
 * termina. Por eso la aserción cuenta llamadas en vez de esperar a un estado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({
  getFullList: vi.fn(),
  getList: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    filter: (expr: string) => expr,
    collection: (name: string) =>
      name === 'challenges'
        ? { update: h.update }
        : { getFullList: h.getFullList, getList: h.getList },
  },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

vi.mock('@calistenia/core/lib/analytics', () => ({
  CANONICAL_ANALYTICS_EVENTS: { challengeCompleted: 'challenge_completed', challengeJoined: 'challenge_joined' },
  op: { track: vi.fn() },
  trackCanonicalEvent: vi.fn(),
}))

import { useChallenges } from '@calistenia/core/hooks/useChallenges'

const USER_ID = 'user-1'

/** Reto ya caducado creado por OTRO usuario: el 403 del update es el caso real. */
function expiredParticipation(creator: string) {
  return {
    id: 'p1',
    user: USER_ID,
    expand: {
      challenge: {
        id: 'c1',
        creator,
        title: 'Reto caducado',
        metric: 'reps',
        starts_at: '2020-01-01',
        ends_at: '2020-01-08',
        status: 'active',
      },
    },
  }
}

function Harness() {
  const { active, past, loading } = useChallenges(USER_ID)
  return (
    <div>
      <span data-testid="loading">{loading ? 'si' : 'no'}</span>
      <span data-testid="active">{active.length}</span>
      <span data-testid="past">{past.length}</span>
    </div>
  )
}

function renderHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  )
}

/** Deja correr efectos + refetches encadenados un rato acotado. */
async function settle(ms = 300) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getList.mockResolvedValue({ totalItems: 2 })
})

describe('useChallenges — auto-cierre de retos caducados', () => {
  it('un participante NO creador ejecuta la query una sola vez (#451)', async () => {
    h.getFullList.mockResolvedValue([expiredParticipation('otro-usuario')])
    h.update.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))

    renderHarness()

    // El reto caducado se clasifica como pasado aunque el servidor lo siga
    // teniendo en 'active': la clasificación local no depende de la escritura.
    await waitFor(() => expect(screen.getByTestId('past').textContent).toBe('1'))
    await settle()

    expect(h.getFullList).toHaveBeenCalledTimes(1)
    // Un único intento de cierre; el 403 no se reintenta en cada fetch.
    expect(h.update).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('active').textContent).toBe('0')
  })

  it('el creador cierra el reto y refresca la lista exactamente una vez', async () => {
    h.getFullList
      .mockResolvedValueOnce([expiredParticipation(USER_ID)])
      // Tras el cierre, el servidor ya devuelve el reto terminado.
      .mockResolvedValue([
        {
          ...expiredParticipation(USER_ID),
          expand: { challenge: { ...expiredParticipation(USER_ID).expand.challenge, status: 'ended' } },
        },
      ])
    h.update.mockResolvedValue({})

    renderHarness()

    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1))
    await settle()

    // Fetch inicial + el refetch que provoca la escritura correcta. Y para.
    expect(h.getFullList).toHaveBeenCalledTimes(2)
    expect(h.update).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('past').textContent).toBe('1')
  })

  it('sin retos caducados no hay escrituras ni refetch', async () => {
    h.getFullList.mockResolvedValue([
      {
        id: 'p2',
        user: USER_ID,
        expand: {
          challenge: {
            id: 'c2',
            creator: 'otro-usuario',
            title: 'Reto vivo',
            metric: 'reps',
            starts_at: '2020-01-01',
            ends_at: '2999-12-31',
            status: 'active',
          },
        },
      },
    ])

    renderHarness()

    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('1'))
    await settle()

    expect(h.getFullList).toHaveBeenCalledTimes(1)
    expect(h.update).not.toHaveBeenCalled()
  })
})
