import { describe, it, expect } from 'vitest'
import { countAccountSessions, type CountClient } from './accountSessions'

function fakeClient(totals: Record<string, number>) {
  const client: CountClient = {
    filter: (raw, params) => raw.replace('{:uid}', `"${params.uid}"`),
    collection: name => ({ getList: async () => ({ totalItems: totals[name] ?? 0 }) }),
  }
  return { client }
}

describe('countAccountSessions', () => {
  it('suma sesiones, circuitos y cardio libre de la cuenta', async () => {
    const { client } = fakeClient({ sessions: 12, circuit_sessions: 3, cardio_sessions: 5 })
    expect(await countAccountSessions(client, 'u1')).toBe(20)
  })

  it('una colección vacía no rompe la suma', async () => {
    const { client } = fakeClient({ sessions: 4 })
    expect(await countAccountSessions(client, 'u1')).toBe(4)
  })

  it('cuenta filas (no días) y filtra por usuario en las tres colecciones', async () => {
    const calls: Array<{ name: string; filter: string }> = []
    const client: CountClient = {
      filter: (raw, params) => raw.replace('{:uid}', `"${params.uid}"`),
      collection: name => ({
        getList: async (_p, perPage, opts) => {
          calls.push({ name, filter: opts.filter })
          expect(perPage).toBe(1)
          expect(opts.fields).toBe('id')
          return { totalItems: 2 }
        },
      }),
    }
    expect(await countAccountSessions(client, 'u1')).toBe(6)
    expect(calls.map(c => c.name).sort()).toEqual(['cardio_sessions', 'circuit_sessions', 'sessions'])
    expect(calls.every(c => c.filter === 'user = "u1"')).toBe(true)
  })
})
