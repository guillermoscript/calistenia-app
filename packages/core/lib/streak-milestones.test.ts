import { describe, it, expect, vi } from 'vitest'
import { STREAK_MILESTONES, pickActiveMilestone } from './streak-milestones'

const nadaEnseñado = () => false

describe('STREAK_MILESTONES', () => {
  it('celebra 2, 4, 8, 12, 26 y 52 semanas, en orden (#801)', () => {
    expect([...STREAK_MILESTONES]).toEqual([2, 4, 8, 12, 26, 52])
  })
})

describe('pickActiveMilestone', () => {
  it('por debajo del primer hito no hay nada que celebrar', () => {
    expect(pickActiveMilestone(1, nadaEnseñado)).toBeNull()
  })

  it('justo al llegar al hito, lo celebra', () => {
    expect(pickActiveMilestone(2, nadaEnseñado)).toBe(2)
  })

  it('devuelve el hito MÁS ALTO alcanzado, no el primero', () => {
    // Quien vuelve tras meses fuera ve el de 52, no una cola de 2→4→8.
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
