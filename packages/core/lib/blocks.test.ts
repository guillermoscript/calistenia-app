import { describe, it, expect } from 'vitest'
import { excludeBlocked } from './blocks'

describe('excludeBlocked', () => {
  const users = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('filtra los usuarios bloqueados', () => {
    expect(excludeBlocked(users, new Set(['b']))).toEqual([{ id: 'a' }, { id: 'c' }])
  })

  it('devuelve el mismo array si no hay bloqueados (sin copia)', () => {
    expect(excludeBlocked(users, new Set())).toBe(users)
  })

  it('array vacío queda vacío', () => {
    expect(excludeBlocked([], new Set(['b']))).toEqual([])
  })
})
