import { describe, it, expect } from 'vitest'
import {
  ONBOARDING_ACTIVITY_TO_NUTRITION,
  inferNutritionGoalType,
  calculateMacros,
  previewNutritionGoal,
  nutritionGoalTypeToPrimaryGoal,
  shouldRecomputeAutoGoal,
} from './nutritionGoal'

describe('ONBOARDING_ACTIVITY_TO_NUTRITION', () => {
  it('mapea los 4 niveles del onboarding al nivel de nutrición', () => {
    expect(ONBOARDING_ACTIVITY_TO_NUTRITION.sedentary).toBe('sedentary')
    expect(ONBOARDING_ACTIVITY_TO_NUTRITION.light).toBe('light')
    expect(ONBOARDING_ACTIVITY_TO_NUTRITION.active).toBe('moderate')
    expect(ONBOARDING_ACTIVITY_TO_NUTRITION.very_active).toBe('active')
  })
})

describe('inferNutritionGoalType', () => {
  it('el primary_goal explícito manda, aunque el delta de peso lo contradiga', () => {
    expect(inferNutritionGoalType(80, 70, 'ganar_musculo')).toBe('muscle_gain')
    expect(inferNutritionGoalType(80, 90, 'perder_grasa')).toBe('fat_loss')
    expect(inferNutritionGoalType(80, 80, 'recomposicion')).toBe('recomp')
    expect(inferNutritionGoalType(80, 60, 'salud_general')).toBe('maintain')
  })

  it('sin primary_goal, cae al delta de peso (umbral ±2 kg)', () => {
    expect(inferNutritionGoalType(80, 85)).toBe('muscle_gain')
    expect(inferNutritionGoalType(80, 70)).toBe('fat_loss')
    expect(inferNutritionGoalType(80, 81)).toBe('maintain')
  })

  it('devuelve undefined si faltan datos y no hay primary_goal', () => {
    expect(inferNutritionGoalType(undefined, 85)).toBeUndefined()
    expect(inferNutritionGoalType(80, undefined)).toBeUndefined()
    expect(inferNutritionGoalType()).toBeUndefined()
  })
})

describe('calculateMacros', () => {
  // Hombre 80 kg / 180 cm / 30 a / moderate → BMR 1780, TDEE 2759.
  it('mantenimiento: valores exactos esperados', () => {
    expect(calculateMacros(80, 180, 30, 'male', 'moderate', 'maintain')).toEqual({
      dailyCalories: 2759,
      dailyProtein: 144, // 1.8 g/kg
      dailyFat: 77, // 25% kcal / 9
      dailyCarbs: 373, // resto
      goal: 'maintain',
      weight: 80,
      height: 180,
      age: 30,
      sex: 'male',
      activityLevel: 'moderate',
    })
  })

  it('aplica el ajuste por objetivo sobre el TDEE', () => {
    const tdee = 2759
    expect(calculateMacros(80, 180, 30, 'male', 'moderate', 'fat_loss').dailyCalories).toBe(tdee - 500)
    expect(calculateMacros(80, 180, 30, 'male', 'moderate', 'muscle_gain').dailyCalories).toBe(tdee + 300)
    expect(calculateMacros(80, 180, 30, 'male', 'moderate', 'recomp').dailyCalories).toBe(tdee - 200)
  })

  it('el ritmo escala el déficit/superávit (recomp lo ignora)', () => {
    const tdee = 2759
    expect(calculateMacros(80, 180, 30, 'male', 'moderate', 'fat_loss', 'gradual').dailyCalories).toBe(tdee - 250)
    expect(calculateMacros(80, 180, 30, 'male', 'moderate', 'fat_loss', 'aggressive').dailyCalories).toBe(tdee - 750)
    expect(calculateMacros(80, 180, 30, 'male', 'moderate', 'recomp', 'aggressive').dailyCalories).toBe(tdee - 200)
  })

  it('la proteína depende del objetivo (g/kg)', () => {
    expect(calculateMacros(80, 180, 30, 'male', 'moderate', 'muscle_gain').dailyProtein).toBe(160) // 2.0
    expect(calculateMacros(80, 180, 30, 'male', 'moderate', 'fat_loss').dailyProtein).toBe(176) // 2.2
  })

  it('usa la fórmula femenina de Mifflin-St Jeor (−161 vs +5)', () => {
    const male = calculateMacros(70, 170, 25, 'male', 'sedentary', 'maintain').dailyCalories
    const female = calculateMacros(70, 170, 25, 'female', 'sedentary', 'maintain').dailyCalories
    // Diferencia de BMR = 166 kcal, escalada por el multiplicador sedentario (1.2).
    expect(male - female).toBe(Math.round(166 * 1.2))
  })

  it('los macros son energéticamente consistentes con las calorías (±5 kcal por redondeo)', () => {
    const g = calculateMacros(72, 165, 41, 'female', 'active', 'fat_loss', 'balanced')
    const fromMacros = g.dailyProtein * 4 + g.dailyCarbs * 4 + g.dailyFat * 9
    expect(Math.abs(fromMacros - g.dailyCalories)).toBeLessThanOrEqual(5)
  })
})

describe('previewNutritionGoal', () => {
  it('equivale a calculateMacros con la misma entrada', () => {
    const profile = { weight: 80, height: 180, age: 30, sex: 'male' as const, activityLevel: 'moderate' as const, pace: 'gradual' as const }
    expect(previewNutritionGoal(profile, 'muscle_gain')).toEqual(
      calculateMacros(80, 180, 30, 'male', 'moderate', 'muscle_gain', 'gradual'),
    )
  })
})

describe('nutritionGoalTypeToPrimaryGoal', () => {
  it('mapea muscle_gain/fat_loss/recomp a su primary_goal correspondiente', () => {
    expect(nutritionGoalTypeToPrimaryGoal('muscle_gain')).toBe('ganar_musculo')
    expect(nutritionGoalTypeToPrimaryGoal('fat_loss')).toBe('perder_grasa')
    expect(nutritionGoalTypeToPrimaryGoal('recomp')).toBe('recomposicion')
  })

  it('maintain es ambiguo → no sobrescribe primary_goal', () => {
    expect(nutritionGoalTypeToPrimaryGoal('maintain')).toBeNull()
  })
})

describe('shouldRecomputeAutoGoal', () => {
  it('recalcula cuando el goal guardado es auto', () => {
    expect(shouldRecomputeAutoGoal('auto')).toBe(true)
  })

  it('no toca un goal manual (el usuario lo ajustó a mano)', () => {
    expect(shouldRecomputeAutoGoal('manual')).toBe(false)
  })

  it('no toca un goal legacy sin source (pre-#243, no hay certeza de que sea auto)', () => {
    expect(shouldRecomputeAutoGoal(undefined)).toBe(false)
  })
})
