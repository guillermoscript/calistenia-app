/**
 * Cuentas privadas (#422): una solicitud pendiente NO es un seguido.
 *
 * Antes de #422 `useFollows` metía toda fila de `follows` en `following` /
 * `followers`, así que el solicitante veía «Siguiendo» y el privado contaba
 * al solicitante como seguidor. El hook no se renderiza (core corre en node),
 * se testea la partición pura.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})), authStore: { record: null } },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
  getUserAvatarUrl: vi.fn(() => null),
}))
vi.mock('../lib/analytics', () => ({ op: { track: vi.fn() } }))

import { partitionFollows } from './useFollows'

const row = (id: string, follower: string, following: string, status?: string) => ({
  id,
  follower,
  following,
  status,
  created: '2026-08-22 10:00:00.000Z',
  expand: {
    follower: { id: follower, display_name: follower.toUpperCase() },
    following: { id: following, display_name: following.toUpperCase() },
  },
})

describe('partitionFollows', () => {
  it('keeps pending requests out of following/followers', () => {
    const out = partitionFollows(
      [row('r1', 'me', 'pub', 'accepted'), row('r2', 'me', 'priv', 'pending')],
      [row('r3', 'fan', 'me', 'accepted'), row('r4', 'stranger', 'me', 'pending')],
    )
    expect(out.following.map(u => u.id)).toEqual(['pub'])
    expect(out.pendingOutgoing.map(u => u.id)).toEqual(['priv'])
    expect(out.followers.map(u => u.id)).toEqual(['fan'])
    // La bandeja lleva el id de la FILA: es lo que piden /accept y /reject.
    expect(out.pendingIncoming).toEqual([
      { id: 'r4', user: { id: 'stranger', displayName: 'STRANGER', username: '', avatarUrl: null }, created: '2026-08-22 10:00:00.000Z' },
    ])
  })

  it('treats rows without status (pre-#422 clients) as accepted', () => {
    const out = partitionFollows([row('r1', 'me', 'old')], [row('r2', 'old', 'me', '')])
    expect(out.following.map(u => u.id)).toEqual(['old'])
    expect(out.followers.map(u => u.id)).toEqual(['old'])
    expect(out.pendingOutgoing).toEqual([])
    expect(out.pendingIncoming).toEqual([])
  })
})
