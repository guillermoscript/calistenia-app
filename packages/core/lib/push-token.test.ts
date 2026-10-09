import { describe, expect, it, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  existing: null as null | { id: string; user: string },
  calls: [] as string[],
  filters: [] as string[],
}))

vi.mock('./pocketbase', () => ({
  pb: {
    filter: (q: string, p: Record<string, unknown>) => `${q}|${JSON.stringify(p)}`,
    collection: (name: string) => ({
      getFirstListItem: async (f: string) => {
        db.filters.push(f)
        if (!db.existing) throw new Error('404')
        return db.existing
      },
      create: async (b: unknown) => { db.calls.push(`${name}.create:${JSON.stringify(b)}`) },
      update: async (id: string, b: unknown) => { db.calls.push(`${name}.update:${id}:${JSON.stringify(b)}`) },
      delete: async (id: string) => { db.calls.push(`${name}.delete:${id}`) },
    }),
  },
}))

import { upsertPushToken, removePushToken } from './push-token'

beforeEach(() => { db.existing = null; db.calls = []; db.filters = [] })

describe('upsertPushToken', () => {
  it('crea el token de Expo si no está', async () => {
    expect(await upsertPushToken('expo_push_tokens', 'T', 'u1', { platform: 'android' })).toBe('created')
    expect(db.calls).toEqual(['expo_push_tokens.create:{"user":"u1","token":"T","platform":"android"}'])
    expect(db.filters[0]).toContain('token = {:token}')
  })
  it('no duplica si ya es del usuario', async () => {
    db.existing = { id: 'r1', user: 'u1' }
    expect(await upsertPushToken('expo_push_tokens', 'T', 'u1')).toBe('exists')
    expect(db.calls).toEqual([])
  })
  it('reasigna si el registro visible es de otro usuario', async () => {
    db.existing = { id: 'r1', user: 'u2' }
    expect(await upsertPushToken('expo_push_tokens', 'T', 'u1', { platform: 'ios' })).toBe('reassigned')
    expect(db.calls[0]).toContain('update:r1')
  })
  it('web: busca por usuario+endpoint y crea con la suscripción', async () => {
    await upsertPushToken('push_subscriptions', 'https://ep', 'u1', { subscription: '{}', user_agent: 'ua' })
    expect(db.filters[0]).toContain('subscription.endpoint')
    expect(db.calls[0]).toBe('push_subscriptions.create:{"user":"u1","subscription":"{}","user_agent":"ua"}')
  })
})

describe('removePushToken', () => {
  it('borra si existe y no lanza si no', async () => {
    db.existing = { id: 'r9', user: 'u1' }
    await removePushToken('push_subscriptions', 'https://ep', 'u1')
    expect(db.calls).toEqual(['push_subscriptions.delete:r9'])
    db.existing = null
    await expect(removePushToken('push_subscriptions', 'x', 'u1')).resolves.toBeUndefined()
  })
})
