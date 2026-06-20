import { describe, it, expect } from 'vitest'
import { buildUserSearchFilter } from '../user-search-filter'

describe('buildUserSearchFilter', () => {
  it('devuelve el template raw con ambos campos', () => {
    const { raw } = buildUserSearchFilter('guille')
    expect(raw).toContain('display_name')
    expect(raw).toContain('username')
  })

  it('propaga el query en params.q', () => {
    const { params } = buildUserSearchFilter('guille')
    expect(params.q).toBe('guille')
  })

  it('query vacío: params.q es cadena vacía y no lanza', () => {
    const { raw, params } = buildUserSearchFilter('')
    expect(params.q).toBe('')
    expect(raw).toContain('display_name')
  })
})
