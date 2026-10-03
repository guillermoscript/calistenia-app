import { describe, it, expect } from 'vitest'
import { BATTLE_LIMITS } from '@calistenia/core/lib/battle'
import { validateBattleConfiguration } from '@calistenia/core/lib/battle'
import type { EditorExercise } from '@calistenia/core/hooks/useProgramEditor'
import {
  addCustomItem, battleChallengeHref, customBattleConfig, customItemFrom, noteKey, noteParams, parseOrigin, parsePhase,
} from './battle-create'

const ex = (over: Partial<EditorExercise> = {}): EditorExercise => ({
  exerciseId: 'push_ups', name: 'Flexiones', sets: 3, reps: '12', rest: 45, muscles: '', note: '',
  youtube: '', priority: 'med', isTimer: false, timerSeconds: 0, ...over,
})

describe('parseOrigin / parsePhase', () => {
  it('accepts the three origins and defaults to preset', () => {
    expect(parseOrigin('program_day')).toBe('program_day')
    expect(parseOrigin('custom')).toBe('custom')
    expect(parseOrigin('nope')).toBe('preset')
    expect(parseOrigin(null)).toBe('preset')
  })
  it('only takes positive integer phases', () => {
    expect(parsePhase('2')).toBe(2)
    expect(parsePhase('0')).toBeNull()
    expect(parsePhase('x')).toBeNull()
    expect(parsePhase(null)).toBeNull()
  })
})

describe('customItemFrom', () => {
  it('reps exercise keeps reps and caps them', () => {
    expect(customItemFrom(ex()).value).toBe(12)
    expect(customItemFrom(ex({ reps: '9999' })).value).toBe(BATTLE_LIMITS.maxReps)
    expect(customItemFrom(ex({ reps: 'max' })).value).toBe(10)
  })
  it('timer exercise becomes seconds', () => {
    const item = customItemFrom(ex({ isTimer: true, timerSeconds: 45 }))
    expect(item).toMatchObject({ kind: 'seconds', value: 45 })
    expect(customItemFrom(ex({ isTimer: true, timerSeconds: 0 })).value).toBe(30)
  })
  it('caps rest at 120 s', () => {
    expect(customItemFrom(ex({ rest: 500 })).rest).toBe(120)
  })
})

describe('addCustomItem', () => {
  it('ignores duplicates and respects the max', () => {
    let items = addCustomItem([], ex())
    expect(addCustomItem(items, ex())).toHaveLength(1)
    for (let i = 0; i < 12; i++) items = addCustomItem(items, ex({ exerciseId: `e${i}` }))
    expect(items).toHaveLength(BATTLE_LIMITS.maxExercises)
  })
})

describe('customBattleConfig', () => {
  it('is null without exercises and valid with them', () => {
    expect(customBattleConfig([], 3, '')).toBeNull()
    const config = customBattleConfig(addCustomItem([], ex()), 3, '  Mi reto ')
    expect(config).toMatchObject({ source: 'custom', rounds: 3, title: 'Mi reto' })
    expect(validateBattleConfiguration(config!)).toEqual([])
  })
})

describe('notes and links', () => {
  it('maps notes to keys and hides the creator-chosen one', () => {
    expect(noteKey({ code: 'rounds_overridden', from: 3, to: 4 })).toBeNull()
    expect(noteKey({ code: 'truncated', dropped: 2, max: 8 })).toBe('battle.note.truncated')
    expect(noteParams({ code: 'truncated', dropped: 2, max: 8 })).toEqual({ dropped: 2, max: 8 })
  })
  it('builds the program-day challenge link with mobile param names', () => {
    expect(battleChallengeHref(2, 'lun')).toBe('/battle-create?origin=program_day&phase=2&day=lun')
  })
})
