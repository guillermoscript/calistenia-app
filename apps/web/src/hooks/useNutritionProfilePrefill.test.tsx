/**
 * `NutritionGoalSetup` congela sus props `initial*` en `useState`, así que
 * montarlo antes de que el perfil llegue lo deja vacío PARA SIEMPRE: el fetch
 * resolvía medio segundo después y los campos ya no se reescribían. El usuario
 * acababa tecleando peso y altura que ya había dado en el onboarding.
 *
 * Por eso el hook expone `loaded`: es la señal que las pantallas meten en su
 * gate de render para no montar el wizard antes de tiempo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const getOne = vi.fn()

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    baseUrl: 'http://pb.test',
    filter: (expr: string) => expr,
    collection: () => ({ getOne: (...a: unknown[]) => getOne(...a) }),
  },
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

import { useNutritionProfilePrefill } from '@calistenia/core/hooks/useNutritionProfilePrefill'

type State = ReturnType<typeof useNutritionProfilePrefill>
let state: State

function Harness({ userId }: { userId: string | null }) {
  state = useNutritionProfilePrefill(userId)
  return null
}

/** Perfil tal como lo dejó el onboarding. */
const USER = {
  weight: 78, height: 180, goal_weight: 72,
  activity_level: 'active', pace: 'balanced', primary_goal: 'perder_grasa',
}

beforeEach(() => { getOne.mockReset() })

describe('useNutritionProfilePrefill', () => {
  it('arranca sin cargar: montar el wizard aquí lo dejaría vacío para siempre', () => {
    getOne.mockReturnValue(new Promise(() => {})) // nunca resuelve
    render(<Harness userId="u1" />)

    expect(state.loaded).toBe(false)
    expect(state.profile.weight).toBeUndefined()
  })

  it('marca `loaded` con el perfil del onboarding ya mapeado', async () => {
    getOne.mockResolvedValue(USER)
    render(<Harness userId="u1" />)

    await waitFor(() => expect(state.loaded).toBe(true))
    expect(state.profile.weight).toBe(78)
    expect(state.profile.height).toBe(180)
    expect(state.profile.activityLevel).toBe('moderate') // 'active' (escala de 4) → escala de 5
    expect(state.profile.goalType).toBe('fat_loss')
    expect(state.profile.pace).toBe('balanced')
  })

  it('si la lectura falla también carga: un skeleton eterno es peor que un wizard vacío', async () => {
    getOne.mockRejectedValue(new Error('500'))
    render(<Harness userId="u1" />)

    await waitFor(() => expect(state.loaded).toBe(true))
    expect(state.profile).toEqual({})
  })

  it('sin usuario no hay nada que esperar', async () => {
    render(<Harness userId={null} />)

    await waitFor(() => expect(state.loaded).toBe(true))
    expect(getOne).not.toHaveBeenCalled()
  })
})
