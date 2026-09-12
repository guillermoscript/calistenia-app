/**
 * El nombre visible de un autor (#620).
 *
 * Antes de este issue `created_by_name` miraba solo `display_name`, así que
 * quien se dio de alta con Google —que llega con `name` y sin `display_name`—
 * aparecía sin nombre en el catálogo. La cascada es la parte que hay que fijar,
 * y sobre todo su ORDEN: `email` es el último recurso, no un empate.
 */

import { describe, it, expect } from 'vitest'
import { authorDisplayName } from './author-name'

describe('authorDisplayName', () => {
  it('prefiere `display_name` cuando están los tres', () => {
    expect(authorDisplayName({
      display_name: 'Guille',
      name: 'Guillermo Marín',
      email: 'g@local.test',
    })).toBe('Guille')
  })

  it('cae a `name` cuando falta `display_name` (el alta por Google)', () => {
    // Este es el caso real que rompía: PocketBase rellena `name` desde el perfil
    // de Google y deja `display_name` vacío. La UI pintaba «?» donde iba el
    // autor del programa.
    expect(authorDisplayName({ name: 'Guillermo Marín', email: 'g@local.test' }))
      .toBe('Guillermo Marín')
  })

  it('cae a `email` solo cuando no hay ningún nombre', () => {
    expect(authorDisplayName({ email: 'g@local.test' })).toBe('g@local.test')
  })

  it('un campo en blanco NO cuenta como nombre', () => {
    // PocketBase devuelve '' (no `undefined`) en un campo de texto vacío, así
    // que un `||` sobre el valor crudo se quedaría con la cadena vacía si no se
    // recortan los espacios.
    expect(authorDisplayName({ display_name: '   ', name: 'Guillermo' })).toBe('Guillermo')
  })

  it('devuelve cadena vacía —nunca `undefined`— cuando no hay usuario', () => {
    // La privacidad por campo de #411 recorta `email` para terceros, así que un
    // usuario puede llegar aquí con los tres campos ocultos. El contrato es que
    // el retorno siempre es string: quien llama hace `|| undefined` si quiere
    // distinguirlo, y ninguna plantilla acaba pintando «undefined».
    expect(authorDisplayName(null)).toBe('')
    expect(authorDisplayName(undefined)).toBe('')
    expect(authorDisplayName({})).toBe('')
    expect(authorDisplayName({ display_name: '', name: '', email: '' })).toBe('')
  })

  it('ignora los campos que no son texto', () => {
    // `expand.created_by` llega sin tipar desde PocketBase; un `display_name`
    // que fuese un objeto (un json {es,en} mal mapeado) pintaría
    // «[object Object]» en la ficha del programa.
    expect(authorDisplayName({
      display_name: { es: 'Guille' } as unknown,
      name: 'Guillermo',
    })).toBe('Guillermo')
  })
})
