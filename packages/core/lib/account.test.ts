import { describe, it, expect, vi, beforeEach } from 'vitest'

// Estado compartido controlable por test — vi.hoisted evita el TDZ del factory
// de vi.mock (se ejecuta antes que los `const` normales del archivo).
const h = vi.hoisted(() => ({
  deleted: [] as string[],
  deleteError: null as unknown,
}))

vi.mock('../lib/pocketbase', () => ({
  pb: {
    collection: (_name: string) => ({
      delete: async (id: string) => {
        if (h.deleteError) throw h.deleteError
        h.deleted.push(id)
        return true
      },
    }),
  },
}))

const { matchesAccountEmail } = await import('./account')
const { deleteAccountRecord } = await import('../hooks/useDeleteAccount')

beforeEach(() => {
  h.deleted = []
  h.deleteError = null
})

describe('matchesAccountEmail', () => {
  it('acepta el email exacto', () => {
    expect(matchesAccountEmail('ana@example.com', 'ana@example.com')).toBe(true)
  })

  it('ignora espacios alrededor y mayúsculas', () => {
    expect(matchesAccountEmail('  Ana@Example.com ', 'ana@example.com')).toBe(true)
    expect(matchesAccountEmail('ana@example.com', '  ANA@EXAMPLE.COM')).toBe(true)
  })

  it('rechaza un email distinto', () => {
    expect(matchesAccountEmail('otra@example.com', 'ana@example.com')).toBe(false)
  })

  it('rechaza coincidencias parciales', () => {
    expect(matchesAccountEmail('ana', 'ana@example.com')).toBe(false)
    expect(matchesAccountEmail('ana@example.com', 'ana@example.com.mx')).toBe(false)
  })

  it('rechaza la cadena vacía', () => {
    expect(matchesAccountEmail('', 'ana@example.com')).toBe(false)
    expect(matchesAccountEmail('   ', 'ana@example.com')).toBe(false)
  })

  it('no da por bueno nada si la cuenta no tiene email', () => {
    expect(matchesAccountEmail('', null)).toBe(false)
    expect(matchesAccountEmail('', undefined)).toBe(false)
    expect(matchesAccountEmail('ana@example.com', '')).toBe(false)
  })
})

describe('deleteAccountRecord', () => {
  it('borra el registro del usuario', async () => {
    await deleteAccountRecord('user123')
    expect(h.deleted).toEqual(['user123'])
  })

  it('trata un 404 como baja ya hecha', async () => {
    h.deleteError = { status: 404 }
    await expect(deleteAccountRecord('user123')).resolves.toBeUndefined()
  })

  it('propaga cualquier otro error para que la UI no finja la baja', async () => {
    h.deleteError = { status: 400, message: 'required relation' }
    await expect(deleteAccountRecord('user123')).rejects.toMatchObject({ status: 400 })
  })
})
