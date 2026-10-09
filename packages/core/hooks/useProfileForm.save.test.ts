/**
 * `saveProfileBody` y `uploadAvatar`: la secuencia que web y móvil comparten.
 * Se fija el orden y qué fallos abortan (solo el `users.update`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const calls = vi.hoisted(() => ({ log: [] as string[], failUsers: false, failDemo: false, forms: [] as unknown[] }))

vi.mock('../lib/pocketbase', () => ({
  pb: {
    collection: (name: string) => ({
      update: async (id: string, data: unknown) => {
        calls.log.push(`${name}.update`)
        calls.forms.push(data)
        if (name === 'users' && calls.failUsers) throw new Error('users')
        if (name === 'nutrition_goals' && calls.failDemo) throw new Error('demo')
        return { id }
      },
      authRefresh: async () => { calls.log.push('authRefresh') },
    }),
  },
}))
vi.mock('./useNutrition', () => ({
  recomputeAutoNutritionGoal: async () => { calls.log.push('recompute'); return null },
}))

import { saveProfileBody } from './useProfileForm'
import { uploadAvatar, removeAvatar } from '../lib/profile-avatar'

beforeEach(() => { calls.log = []; calls.forms = []; calls.failUsers = false; calls.failDemo = false })

const base = {
  userId: 'u1',
  patch: { display_name: 'Ana' },
  body: { weight: '70,5', height: '170', activityLevel: 'active' as const },
  bodyGoalId: 'g1', age: '30', sex: 'female',
}

describe('saveProfileBody', () => {
  it('actualiza users con patch + cuerpo, luego edad/sexo y recalcula', async () => {
    await saveProfileBody(base)
    expect(calls.forms[0]).toMatchObject({ display_name: 'Ana', weight: 70.5, height: 170, activity_level: 'active' })
    await vi.waitFor(() => expect(calls.log).toEqual(['users.update', 'nutrition_goals.update', 'recompute']))
  })

  it('si users.update falla lanza y no toca nada más', async () => {
    calls.failUsers = true
    await expect(saveProfileBody(base)).rejects.toThrow('users')
    expect(calls.log).toEqual(['users.update'])
  })

  it('un fallo de edad/sexo no aborta: se reporta y sigue', async () => {
    calls.failDemo = true
    const onSoftError = vi.fn()
    await saveProfileBody({ ...base, onSoftError })
    expect(onSoftError).toHaveBeenCalledWith('age_sex', expect.any(Error))
    await vi.waitFor(() => expect(calls.log).toContain('recompute'))
  })

  it('sin objetivo nutricional no escribe edad/sexo', async () => {
    await saveProfileBody({ ...base, bodyGoalId: null })
    expect(calls.log).not.toContain('nutrition_goals.update')
  })
})

describe('avatar', () => {
  it('uploadAvatar sube el fichero y refresca el authStore', async () => {
    await uploadAvatar('u1', new Blob(['x']), 'a.jpg')
    expect(calls.log).toEqual(['users.update', 'authRefresh'])
    expect((calls.forms[0] as FormData).get('avatar')).toBeInstanceOf(Blob)
  })

  it('removeAvatar manda avatar:null', async () => {
    await removeAvatar('u1')
    expect(calls.forms[0]).toEqual({ avatar: null })
    expect(calls.log).toEqual(['users.update', 'authRefresh'])
  })
})
