/**
 * Escrituras a PocketBase del flujo de onboarding, compartidas entre web y
 * móvil (#472). El hook es dueño de los flags de guardado y de `saveError`;
 * la navegación entre pasos queda en cada app: cada guardado devuelve
 * `false` al fallar y el componente NO avanza de paso (#222).
 * Lo específico de plataforma se inyecta: `captureException` (el Sentry de
 * cada app) y `onSaveError` (haptics en móvil).
 */
import { useState } from 'react'
import { pb } from '../lib/pocketbase'
import { op } from '../lib/analytics'
import { parseDecimal } from '../lib/bmi'
import { upsertUserHealth } from './useUserHealth'
import type { BasicsValues, GoalsValues, HealthValues, TrainingValues } from '../types/onboarding'

export interface OnboardingSubmitOptions {
  userId: string | undefined
  /** Reporta la excepción al Sentry de la plataforma, con el nombre del paso. */
  captureException: (e: unknown, stepName: string) => void
  /** Feedback extra al fallar un guardado (haptics en móvil). */
  onSaveError?: () => void
}

export function useOnboardingSubmit({ userId, captureException, onSaveError }: OnboardingSubmitOptions) {
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingGoals, setSavingGoals] = useState(false)
  const [savingHealth, setSavingHealth] = useState(false)
  const [savingTraining, setSavingTraining] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const handleSaveFailed = (e: unknown, stepName: string) => {
    captureException(e, stepName)
    op.track('onboarding_save_failed', { step_name: stepName })
    onSaveError?.()
    setSaveError(true)
  }

  const saveBasics = async (basics: BasicsValues): Promise<boolean> => {
    if (!userId) return false
    setSavingProfile(true)
    try {
      // Edad/sexo ya no existen en `users` (PII; viven en `nutrition_goals`,
      // que el wizard de nutrición pide al crear el objetivo). Aquí solo se
      // usan para las heurísticas del propio flujo.
      await pb.collection('users').update(userId, {
        weight: parseDecimal(basics.weight),
        height: parseDecimal(basics.height),
      })
    } catch (e) {
      handleSaveFailed(e, 'profile')
      return false
    } finally {
      setSavingProfile(false)
    }
    return true
  }

  const saveGoals = async (goals: GoalsValues): Promise<boolean> => {
    if (!userId) return false
    setSavingGoals(true)
    const waist = parseDecimal(goals.waist)
    try {
      await pb.collection('users').update(userId, {
        primary_goal: goals.primary_goal || '',
        goal_weight: parseDecimal(goals.goal_weight),
        waist,
        activity_level: goals.activity_level || '',
        pace: goals.pace || '',
      })
    } catch (e) {
      handleSaveFailed(e, 'goals')
      setSavingGoals(false)
      return false
    }
    // La cintura también se registra como medición corporal con fecha (historial).
    if (waist) {
      try {
        await pb.collection('body_measurements').create({
          user: userId,
          date: new Date().toISOString().slice(0, 10),
          waist,
        })
      } catch (e) {
        console.warn('Failed to save waist measurement:', e)
      }
    }
    setSavingGoals(false)
    return true
  }

  // Salud → colección `user_health` (en `users` estos campos son PII ocultos
  // que no se pueden escribir con token de usuario; ver #247).
  const saveHealth = async (values: HealthValues): Promise<boolean> => {
    if (!userId) return false
    setSavingHealth(true)
    try {
      await upsertUserHealth(userId, {
        medical_conditions: values.medical_conditions,
        injuries: values.injuries,
      })
    } catch (e) {
      handleSaveFailed(e, 'health')
      return false
    } finally {
      setSavingHealth(false)
    }
    return true
  }

  const saveTraining = async (training: TrainingValues): Promise<boolean> => {
    if (!userId) return false
    setSavingTraining(true)
    try {
      await pb.collection('users').update(userId, {
        level: training.level || 'principiante',
        focus_areas: training.focus_areas,
        training_days: training.training_days,
        intensity: training.intensity || '',
        goal: training.goal || '',
      })
    } catch (e) {
      handleSaveFailed(e, 'training')
      return false
    } finally {
      setSavingTraining(false)
    }
    return true
  }

  return {
    savingProfile,
    savingGoals,
    savingHealth,
    savingTraining,
    saveError,
    setSaveError,
    saveBasics,
    saveGoals,
    saveHealth,
    saveTraining,
  }
}
