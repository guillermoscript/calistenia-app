/**
 * Qué hace cada botón del bloque «Hoy» (#858): arrancar un día del programa,
 * continuar lo que esté en curso o descartarlo. La analítica la pone la
 * pantalla, que sabe en qué estado se pulsó.
 */
import { useCallback } from 'react'
import { Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { useCircuitSession } from '@/contexts/CircuitSessionContext'
import { useActiveBattle } from '@/lib/use-active-battle'
import type { HomeActiveActivity, HomeDayType } from '@calistenia/core/lib/homeState'
import type { DayId } from '@calistenia/core/types'

export interface StartableDay {
  dayId: DayId
  workoutKey: string
  dayType: HomeDayType
}

export function useHomeActions(phase: number) {
  const router = useRouter()
  const { t } = useTranslation()
  const { activeProgram, cardioDayConfigs, circuitDayConfigs } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  const session = useActiveSession()
  const { startCircuit, abandonCircuit } = useCircuitSession()
  const { data: battle } = useActiveBattle()

  const startDay = useCallback((day: StartableDay) => {
    const key = day.workoutKey
    if (day.dayType === 'cardio') {
      const cfg = cardioDayConfigs[key]
      router.push({
        pathname: '/cardio',
        params: {
          ...(activeProgram ? { program: activeProgram.id, dayKey: key } : {}),
          ...(cfg?.activityType ? { activity: cfg.activityType } : {}),
          ...(cfg?.targetDistanceKm ? { targetKm: String(cfg.targetDistanceKm) } : {}),
          ...(cfg?.targetDurationMin ? { targetMin: String(cfg.targetDurationMin) } : {}),
        },
      })
      return
    }
    if (day.dayType === 'circuit') {
      const cfg = circuitDayConfigs[key]
      if (!cfg) return
      // `p{fase}_{día}`: el formato que casa con los consumidores del progreso (#625).
      startCircuit(cfg, 'program', activeProgram?.id, key)
      router.push('/circuit')
      return
    }
    const workout = getWorkout(phase, day.dayId)
    if (!workout) return
    // Si ya hay una sesión de este mismo día, se retoma; si es de otro, se
    // reemplaza. Sin `endSession()` delante: `startSession` ya resetea el
    // estado y decide el desenlace de la que se reemplaza (#636).
    if (!session.isActive || session.workoutKey !== key) {
      session.startSession(workout, key, 'program')
    }
    router.push('/session')
  }, [activeProgram, cardioDayConfigs, circuitDayConfigs, getWorkout, phase, router, session, startCircuit])

  const continueActivity = useCallback((activity: HomeActiveActivity) => {
    switch (activity.type) {
      case 'battle':
        if (battle) router.push(`/battle/${battle.id}`)
        return
      case 'cardio':
        router.push('/cardio')
        return
      case 'circuit':
        router.push('/circuit')
        return
      default:
        router.push('/session')
    }
  }, [battle, router])

  /** Solo fuerza, sesión libre y circuito: el cardio y la batalla se cierran en su pantalla. */
  const discardActivity = useCallback((activity: HomeActiveActivity) => {
    const run = activity.type === 'circuit' ? abandonCircuit : session.endSession
    Alert.alert(t('home.action.discard'), t('home.action.discardConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('home.action.discard'), style: 'destructive', onPress: run },
    ])
  }, [abandonCircuit, session.endSession, t])

  return { startDay, continueActivity, discardActivity }
}
