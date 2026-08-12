import { describe, it, expect } from 'vitest'
import { buildUserSearchFilter } from '../user-search-filter'

/**
 * Campos que existen de verdad en la colección `users` de PocketBase.
 *
 * El test anterior comprobaba `expect(raw).toContain('username')` y por eso
 * fijó el bug de #408 durante meses: `username` no existe en la colección, así
 * que PocketBase devolvía 400 y la búsqueda no funcionaba nunca — pero el test
 * pasaba, porque solo miraba la cadena.
 *
 * Ahora se hace al revés: se extraen los campos que menciona el filtro y se
 * exige que TODOS estén en esta lista. Añadir un campo fantasma rompe el test.
 */
const USERS_FIELDS = new Set([
  'id', 'email', 'emailVisibility', 'verified', 'name', 'avatar',
  'created', 'updated', 'display_name', 'weight', 'height', 'level',
  'goal', 'role', 'tier', 'referral_code', 'timezone', 'goal_weight',
  'activity_level', 'pace', 'focus_areas', 'training_days', 'intensity',
  'shopping_cadence_days', 'default_currency', 'currency_rates',
  'blocked_users', 'primary_goal', 'waist',
])

/** Nombres a la izquierda de un operador de comparación en el filtro. */
function fieldsIn(raw: string): string[] {
  return [...raw.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:~|=|!=|>=|<=|>|<)/g)]
    .map((m) => m[1])
}

describe('buildUserSearchFilter', () => {
  it('solo referencia campos que existen en la colección users', () => {
    const { raw } = buildUserSearchFilter('guille')
    const used = fieldsIn(raw)

    expect(used.length).toBeGreaterThan(0)
    for (const field of used) {
      expect(
        USERS_FIELDS.has(field),
        `el filtro usa "${field}", que no existe en users → PocketBase responde 400 (#408)`,
      ).toBe(true)
    }
  })

  it('busca por display_name y por name', () => {
    const { raw } = buildUserSearchFilter('guille')
    expect(fieldsIn(raw)).toEqual(expect.arrayContaining(['display_name', 'name']))
  })

  it('no busca por email: permitiría comprobar si una dirección está registrada', () => {
    const { raw } = buildUserSearchFilter('guille')
    expect(fieldsIn(raw)).not.toContain('email')
  })

  it('propaga el query en params.q en vez de interpolarlo', () => {
    const { raw, params } = buildUserSearchFilter('guille')
    expect(params.q).toBe('guille')
    expect(raw).toContain('{:q}')
    expect(raw).not.toContain('guille')
  })

  it('query vacío: params.q es cadena vacía y no lanza', () => {
    const { raw, params } = buildUserSearchFilter('')
    expect(params.q).toBe('')
    expect(fieldsIn(raw)).toContain('display_name')
  })
})
