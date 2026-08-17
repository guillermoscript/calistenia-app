import { describe, it, expect, vi } from 'vitest'
import { STREAK_MILESTONES, pickActiveMilestone } from './streak-milestones'

const nadaEnseñado = () => false

describe('STREAK_MILESTONES', () => {
  it('celebra 7, 14, 30, 60 y 100 días, en orden', () => {
    expect([...STREAK_MILESTONES]).toEqual([7, 14, 30, 60, 100])
  })
})

describe('pickActiveMilestone', () => {
  it('por debajo del primer hito no hay nada que celebrar', () => {
    expect(pickActiveMilestone(6, nadaEnseñado)).toBeNull()
  })

  it('justo al llegar al hito, lo celebra', () => {
    expect(pickActiveMilestone(7, nadaEnseñado)).toBe(7)
  })

  it('devuelve el hito MÁS ALTO alcanzado, no el primero', () => {
    // Quien vuelve tras meses fuera ve el de 100, no una cola de 7→14→30.
    expect(pickActiveMilestone(120, nadaEnseñado)).toBe(100)
  })

  it('salta los que ya se enseñaron y baja al siguiente pendiente', () => {
    const enseñados = [100, 60]
    expect(pickActiveMilestone(120, (m) => enseñados.includes(m))).toBe(30)
  })

  it('con todos enseñados no vuelve a celebrar nada', () => {
    expect(pickActiveMilestone(120, () => true)).toBeNull()
  })

  it('entre dos hitos se queda en el de abajo', () => {
    expect(pickActiveMilestone(59, nadaEnseñado)).toBe(30)
  })

  it('corta en el primer hito que sirve: no consulta los de más abajo', () => {
    // Importa porque en web cada consulta es una lectura de localStorage.
    const isShown = vi.fn(() => false)
    expect(pickActiveMilestone(120, isShown)).toBe(100)
    expect(isShown).toHaveBeenCalledTimes(1)
  })

  it('una racha de 0 o negativa no celebra nada', () => {
    expect(pickActiveMilestone(0, nadaEnseñado)).toBeNull()
    expect(pickActiveMilestone(-5, nadaEnseñado)).toBeNull()
  })
})
