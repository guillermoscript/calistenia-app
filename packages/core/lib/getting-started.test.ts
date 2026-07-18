import { describe, it, expect } from 'vitest'
import {
  deriveChecklist,
  checklistDismissedKey,
  checklistCompletedKey,
  CHECKLIST_ITEM_IDS,
  type ChecklistInputs,
} from './getting-started'

const empty: ChecklistInputs = {
  hasActiveProgram: false,
  totalSessions: 0,
  mealCount: 0,
  cardioCount: 0,
  photoCount: 0,
  followingCount: 0,
}

describe('deriveChecklist', () => {
  it('usuario nuevo: 0/6, nada hecho, allDone false', () => {
    const s = deriveChecklist(empty)
    expect(s.doneCount).toBe(0)
    expect(s.total).toBe(6)
    expect(s.allDone).toBe(false)
    expect(s.items.every(i => !i.done)).toBe(true)
  })

  it('mantiene el orden fijo de presentación', () => {
    expect(deriveChecklist(empty).items.map(i => i.id)).toEqual([...CHECKLIST_ITEM_IDS])
  })

  it('programa: hecho con matrícula activa', () => {
    const s = deriveChecklist({ ...empty, hasActiveProgram: true })
    expect(s.items.find(i => i.id === 'program')?.done).toBe(true)
    expect(s.doneCount).toBe(1)
  })

  it('programa: también hecho si hay sesiones aunque abandonara el programa', () => {
    const s = deriveChecklist({ ...empty, totalSessions: 3 })
    expect(s.items.find(i => i.id === 'program')?.done).toBe(true)
    expect(s.items.find(i => i.id === 'workout')?.done).toBe(true)
    expect(s.doneCount).toBe(2)
  })

  it('cada señal marca su ítem', () => {
    const s = deriveChecklist({
      hasActiveProgram: true,
      totalSessions: 0,
      mealCount: 2,
      cardioCount: 1,
      photoCount: 4,
      followingCount: 1,
    })
    const by = Object.fromEntries(s.items.map(i => [i.id, i.done]))
    expect(by).toEqual({
      program: true,
      workout: false,
      meal: true,
      cardio: true,
      photo: true,
      friend: true,
    })
    expect(s.doneCount).toBe(5)
    expect(s.allDone).toBe(false)
  })

  it('los 6 hechos → allDone', () => {
    const s = deriveChecklist({
      hasActiveProgram: true,
      totalSessions: 1,
      mealCount: 1,
      cardioCount: 1,
      photoCount: 1,
      followingCount: 1,
    })
    expect(s.doneCount).toBe(6)
    expect(s.allDone).toBe(true)
  })
})

describe('claves de storage', () => {
  it('son por usuario y distintas entre sí', () => {
    expect(checklistDismissedKey('u1')).toBe('calistenia_mobile_checklist_dismissed_u1')
    expect(checklistCompletedKey('u1')).toBe('calistenia_mobile_checklist_completed_u1')
    expect(checklistDismissedKey('u1')).not.toBe(checklistCompletedKey('u1'))
  })
})
