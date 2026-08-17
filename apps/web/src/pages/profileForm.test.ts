/**
 * Reducer del formulario de perfil (#478).
 *
 * Vive en `apps/web` y no en `packages/core` porque core corre en node sin
 * testing-library y sin runner propio; web (jsdom) es donde se montan hoy los
 * hooks de core. Este test solo necesita el reducer, que es una función pura.
 */
import { describe, it, expect, vi } from 'vitest'

// `useProfileForm` importa `pb` en top-level, y eso exige un `initCore()` que en
// un test unitario no tiene sentido montar. Aquí solo se ejercitan funciones
// puras, así que basta con que el módulo de PocketBase exista.
vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: { collection: () => ({}), filter: () => '' },
}))

import {
  profileFormReducer,
  bodyUserPatch,
  bodyFromUserRecord,
  EMPTY_PROFILE_FORM,
} from '@calistenia/core/hooks/useProfileForm'

describe('profileFormReducer', () => {
  it('set cambia solo el campo indicado', () => {
    const next = profileFormReducer(EMPTY_PROFILE_FORM, { type: 'set', field: 'weight', value: '71.5' })
    expect(next.weight).toBe('71.5')
    expect(next.height).toBe(EMPTY_PROFILE_FORM.height)
    // No muta el estado anterior.
    expect(EMPTY_PROFILE_FORM.weight).toBe('')
  })

  it('toggle añade el elemento si no está y lo quita si está', () => {
    const added = profileFormReducer(EMPTY_PROFILE_FORM, { type: 'toggle', field: 'injuries', item: 'knee' })
    expect(added.injuries).toEqual(['knee'])
    const removed = profileFormReducer(added, { type: 'toggle', field: 'injuries', item: 'knee' })
    expect(removed.injuries).toEqual([])
  })

  it('toggle conserva el resto de elementos de la lista', () => {
    const a = profileFormReducer(EMPTY_PROFILE_FORM, { type: 'toggle', field: 'focusAreas', item: 'core' })
    const b = profileFormReducer(a, { type: 'toggle', field: 'focusAreas', item: 'legs' })
    const c = profileFormReducer(b, { type: 'toggle', field: 'focusAreas', item: 'core' })
    expect(c.focusAreas).toEqual(['legs'])
  })

  it('hydrate mezcla y deja intactos los campos no incluidos', () => {
    const withName = profileFormReducer(EMPTY_PROFILE_FORM, { type: 'set', field: 'displayName', value: 'Test B' })
    const next = profileFormReducer(withName, { type: 'hydrate', values: { age: '25', sex: 'male' } })
    expect(next.age).toBe('25')
    expect(next.sex).toBe('male')
    expect(next.displayName).toBe('Test B')
  })

  it('hydrate parcial no borra el nivel por defecto', () => {
    const next = profileFormReducer(EMPTY_PROFILE_FORM, { type: 'hydrate', values: { weight: '80' } })
    expect(next.level).toBe('principiante')
  })
})

describe('bodyUserPatch', () => {
  it('mapea a los nombres de columna de `users`', () => {
    expect(bodyUserPatch({ weight: '71.5', height: '176', activityLevel: 'active' }))
      .toEqual({ weight: 71.5, height: 176, activity_level: 'active' })
  })

  it('manda null cuando el campo está vacío, como hacía el código anterior', () => {
    const patch = bodyUserPatch({ weight: '', height: '', activityLevel: '' })
    expect(patch.weight).toBeNull()
    expect(patch.height).toBeNull()
    expect(patch.activity_level).toBe('')
  })

  it('acepta la coma decimal', () => {
    expect(bodyUserPatch({ weight: '71,5', height: '176', activityLevel: '' }).weight).toBe(71.5)
  })
})

describe('bodyFromUserRecord', () => {
  it('convierte los números del registro a las cadenas del formulario', () => {
    expect(bodyFromUserRecord({ weight: 71.5, height: 176, activity_level: 'light' }))
      .toEqual({ weight: '71.5', height: '176', activityLevel: 'light' })
  })

  it('un registro sin datos deja los campos vacíos, no "0" ni "undefined"', () => {
    expect(bodyFromUserRecord({ weight: 0, height: null, activity_level: '' }))
      .toEqual({ weight: '', height: '', activityLevel: '' })
  })
})
