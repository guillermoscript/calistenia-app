import { describe, it, expect, vi } from 'vitest'
import { STREAK_MILESTONES, pickActiveMilestone } from './streak-milestones'
import { WEEKLY_STREAK_MILESTONES } from './weeklyStreak'

const nadaEnseñado = () => false

describe('STREAK_MILESTONES', () => {
  it('celebra 4, 8, 12, 26 y 52 semanas, en orden (#801)', () => {
    expect([...STREAK_MILESTONES]).toEqual([4, 8, 12, 26, 52])
  })
})

describe('pickActiveMilestone', () => {
  it('por debajo del primer hito no hay nada que celebrar', () => {
    expect(pickActiveMilestone(3, nadaEnseñado)).toBeNull()
  })

  it('justo al llegar al hito, lo celebra', () => {
    expect(pickActiveMilestone(4, nadaEnseñado)).toBe(4)
  })

  it('devuelve el hito MÁS ALTO alcanzado, no el primero', () => {
    // Quien vuelve tras meses fuera ve el de 52, no una cola de 4→8→12.
    expect(pickActiveMilestone(60, nadaEnseñado)).toBe(52)
  })

  it('salta los que ya se enseñaron y baja al siguiente pendiente', () => {
    const enseñados = [52, 26]
    expect(pickActiveMilestone(60, (m) => enseñados.includes(m))).toBe(12)
  })

  it('con todos enseñados no vuelve a celebrar nada', () => {
    expect(pickActiveMilestone(60, () => true)).toBeNull()
  })

  it('entre dos hitos se queda en el de abajo', () => {
    expect(pickActiveMilestone(25, nadaEnseñado)).toBe(12)
  })

  it('corta en el primer hito que sirve: no consulta los de más abajo', () => {
    // Importa porque en web cada consulta es una lectura de localStorage.
    const isShown = vi.fn(() => false)
    expect(pickActiveMilestone(60, isShown)).toBe(52)
    expect(isShown).toHaveBeenCalledTimes(1)
  })

  it('una racha de 0 o negativa no celebra nada', () => {
    expect(pickActiveMilestone(0, nadaEnseñado)).toBeNull()
    expect(pickActiveMilestone(-5, nadaEnseñado)).toBeNull()
  })
})

describe('pickActiveMilestone con hitos semanales (#858)', () => {
  it('usa la lista que se le pasa: 4, 8, 12, 26 y 52 semanas', () => {
    expect(pickActiveMilestone(3, nadaEnseñado, WEEKLY_STREAK_MILESTONES)).toBeNull()
    expect(pickActiveMilestone(4, nadaEnseñado, WEEKLY_STREAK_MILESTONES)).toBe(4)
    expect(pickActiveMilestone(13, nadaEnseñado, WEEKLY_STREAK_MILESTONES)).toBe(12)
    // 7 días es un hito de la racha diaria, no de la semanal.
    expect(pickActiveMilestone(7, nadaEnseñado, WEEKLY_STREAK_MILESTONES)).toBe(4)
  })
})
