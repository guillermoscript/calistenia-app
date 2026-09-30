import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const updateSettings = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../contexts/WorkoutContext', () => ({
  useWorkoutActions: () => ({ updateSettings }),
}))

import { WeeklyGoalSetting } from './WeeklyGoalSetting'

describe('WeeklyGoalSetting (#856)', () => {
  beforeEach(() => updateSettings.mockClear())

  it('ofrece de 1 a 7 y marca el objetivo actual', () => {
    render(<WeeklyGoalSetting goal={4} isCustom={false} programGoal={4} />)
    const options = screen.getAllByRole('button', { pressed: false }).concat(screen.getAllByRole('button', { pressed: true }))
    expect(options.filter(b => /^[1-7]$/.test(b.textContent ?? ''))).toHaveLength(7)
    expect(screen.getByRole('button', { name: '4', pressed: true })).toBeTruthy()
  })

  it('guarda el objetivo elegido con weeklyGoalCustom = true', async () => {
    render(<WeeklyGoalSetting goal={4} isCustom={false} programGoal={4} />)
    await userEvent.click(screen.getByRole('button', { name: '2' }))
    await userEvent.click(screen.getByRole('button', { name: 'profile.weeklyGoal.save:2' }))
    expect(updateSettings).toHaveBeenCalledWith({ weeklyGoal: 2, weeklyGoalCustom: true })
  })

  it('sin personalizar, guardar el mismo número lo fija igualmente', async () => {
    render(<WeeklyGoalSetting goal={4} isCustom={false} programGoal={4} />)
    await userEvent.click(screen.getByRole('button', { name: 'profile.weeklyGoal.save:4' }))
    expect(updateSettings).toHaveBeenCalledWith({ weeklyGoal: 4, weeklyGoalCustom: true })
  })

  it('personalizado: sin cambios no guarda y se puede volver al del programa', async () => {
    render(<WeeklyGoalSetting goal={5} isCustom programGoal={3} />)
    expect(screen.getByRole('button', { name: 'profile.weeklyGoal.save:5' }).hasAttribute('disabled')).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'profile.weeklyGoal.useProgram' }))
    expect(updateSettings).toHaveBeenCalledWith({ weeklyGoalCustom: false })
  })

  it('sin personalizar no enseña «usar el del programa»', () => {
    render(<WeeklyGoalSetting goal={3} isCustom={false} programGoal={3} />)
    expect(screen.queryByRole('button', { name: 'profile.weeklyGoal.useProgram' })).toBeNull()
  })
})
