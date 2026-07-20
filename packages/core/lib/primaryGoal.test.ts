import { describe, it, expect } from 'vitest'
import {
  isPrimaryGoal,
  primaryGoalToProgramGoalType,
  primaryGoalToNutritionGoalType,
  primaryGoalImpliesWeightChange,
} from './primaryGoal'
import { PRIMARY_GOAL_IDS } from '../types/onboarding'

describe('isPrimaryGoal', () => {
  it('acepta todos los ids válidos', () => {
    for (const id of PRIMARY_GOAL_IDS) expect(isPrimaryGoal(id)).toBe(true)
  })
  it('rechaza valores desconocidos, vacíos o no-string', () => {
    expect(isPrimaryGoal('')).toBe(false)
    expect(isPrimaryGoal('otro')).toBe(false)
    expect(isPrimaryGoal(undefined)).toBe(false)
    expect(isPrimaryGoal(3)).toBe(false)
  })
})

describe('primaryGoalToProgramGoalType', () => {
  it('mapea objetivos de peso a su goal_type', () => {
    expect(primaryGoalToProgramGoalType('ganar_musculo')).toBe('muscle_gain')
    expect(primaryGoalToProgramGoalType('perder_grasa')).toBe('fat_loss')
  })
  it('recomp, resistencia, habilidades y salud caen en maintain (sin programas dedicados aún)', () => {
    expect(primaryGoalToProgramGoalType('recomposicion')).toBe('maintain')
    expect(primaryGoalToProgramGoalType('resistencia')).toBe('maintain')
    expect(primaryGoalToProgramGoalType('habilidades')).toBe('maintain')
    expect(primaryGoalToProgramGoalType('salud_general')).toBe('maintain')
  })
})

describe('primaryGoalToNutritionGoalType', () => {
  it('mapea a los 4 objetivos de nutrición', () => {
    expect(primaryGoalToNutritionGoalType('ganar_musculo')).toBe('muscle_gain')
    expect(primaryGoalToNutritionGoalType('perder_grasa')).toBe('fat_loss')
    expect(primaryGoalToNutritionGoalType('recomposicion')).toBe('recomp')
    expect(primaryGoalToNutritionGoalType('resistencia')).toBe('maintain')
    expect(primaryGoalToNutritionGoalType('habilidades')).toBe('maintain')
    expect(primaryGoalToNutritionGoalType('salud_general')).toBe('maintain')
  })
})

describe('primaryGoalImpliesWeightChange', () => {
  it('solo ganar músculo y perder grasa implican cambio de peso', () => {
    expect(primaryGoalImpliesWeightChange('ganar_musculo')).toBe(true)
    expect(primaryGoalImpliesWeightChange('perder_grasa')).toBe(true)
    expect(primaryGoalImpliesWeightChange('recomposicion')).toBe(false)
    expect(primaryGoalImpliesWeightChange('resistencia')).toBe(false)
    expect(primaryGoalImpliesWeightChange('habilidades')).toBe(false)
    expect(primaryGoalImpliesWeightChange('salud_general')).toBe(false)
  })
})
