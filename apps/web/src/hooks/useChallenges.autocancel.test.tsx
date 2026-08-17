/**
 * Test del segundo sitio con el mismo fallo de auto-cancelación que #536.
 *
 * `createChallenge` da de alta al creador y a cada invitado con un solo
 * `Promise.all` sobre `challenge_participants`. Como todas esas altas comparten
 * ruta, el SDK abortaba todas menos la última, y el `.catch(() => {})` que estaba
 * ahí para ignorar duplicados se tragaba el aborto: un reto creado con invitados
 * se quedaba con un participante, y a veces sin el propio creador. Nada fallaba a
 * la vista —`createChallenge` devolvía el id igual—, así que solo se detecta
 * contando filas.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const pbStub = await vi.hoisted(async () => {
  const { createPbAutoCancelStub } = await import('../test/pbAutoCancelStub')
  return createPbAutoCancelStub()
})

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    baseUrl: 'http://pb.test',
    filter: (expr: string) => expr,
    collection: pbStub.collection,
  },
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

vi.mock('@calistenia/core/lib/analytics', () => ({
  op: { track: vi.fn() },
  trackCanonicalEvent: vi.fn(),
  CANONICAL_ANALYTICS_EVENTS: { challengeJoined: 'challenge_joined' },
}))

import { useChallenges } from '@calistenia/core/hooks/useChallenges'

type Challenges = ReturnType<typeof useChallenges>

let challenges: Challenges

function Harness() {
  challenges = useChallenges('user_creator')
  return null
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  )
}

describe('useChallenges — auto-cancelación de PocketBase (#536)', () => {
  beforeEach(() => {
    pbStub.reset()
  })

  it('da de alta al creador y a todos los invitados como participantes', async () => {
    mount()

    let id: string | null = null
    await act(async () => {
      id = await challenges.createChallenge({
        title: 'Reto de dominadas',
        metric: 'reps',
        starts_at: '2026-08-17',
        ends_at: '2026-08-24',
        invitedUserIds: ['user_a', 'user_b'],
      })
    })

    expect(id).toBeTruthy()
    // Creador + 2 invitados. El bug dejaba una sola fila.
    expect(pbStub.rows.challenge_participants ?? []).toHaveLength(3)
    expect((pbStub.rows.challenge_participants ?? []).map(r => r.user)).toEqual(
      expect.arrayContaining(['user_creator', 'user_a', 'user_b']),
    )
    expect(pbStub.aborted).toEqual([])

    const participantWrites = pbStub.writes.filter(w => w.collection === 'challenge_participants')
    expect(participantWrites).toHaveLength(3)
    for (const w of participantWrites) {
      expect(w.options).toEqual({ requestKey: null })
    }
  })
})
