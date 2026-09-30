/**
 * Inicio «qué hago hoy» (#858, épica #852). Mismo esqueleto que la web (#855):
 * cabecera, bloque «Hoy» según `getHomeState` (#853), la semana y como mucho
 * dos filas de «Para ti». Lo que salía antes (stats, sueño, retos, actividad,
 * accesos rápidos…) vive en Progreso, Comunidad (#860) o Perfil (#859).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { OptionSheet } from '@/components/ui/option-sheet'
import HomeHeader from '@/components/home/HomeHeader'
import TodayBlock from '@/components/home/TodayBlock'
import WeekRow, { FirstWeekGoal } from '@/components/home/WeekRow'
import ParaTi from '@/components/home/ParaTi'
import StreakMilestone from '@/components/StreakMilestone'
import WhatsNewModal from '@/components/WhatsNewModal'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useAuthUser } from '@/lib/use-auth-user'
import { useHomeView } from '@/lib/use-home-state'
import { useHomeActions } from '@/lib/use-home-actions'
import { setAccountHasTrained } from '@/lib/overlay-gate'
import { useNotifications } from '@calistenia/core/hooks/useNotifications'
import { dayIdFromDateStr } from '@calistenia/core/lib/programProgress'
import { homeDayType, type HomeDayRef } from '@calistenia/core/lib/homeState'
import { paraTiEnabled } from '@calistenia/core/lib/paraTi'
import { WEEK_ORDER, isTrainableDay } from '@calistenia/core/lib/training-day'
import { plannedSetCount, trackWorkoutDayViewed } from '@calistenia/core/lib/session-funnel'
import {
  homeAnalyticsModifiers,
  resetHomeView,
  trackHomeChangeDay,
  trackHomeParaTiTap,
  trackHomePrimaryCta,
  trackHomeSecondaryTap,
  trackHomeViewed,
  type HomeSecondaryTarget,
} from '@calistenia/core/lib/home-analytics'
import type { ParaTiKind } from '@calistenia/core/lib/paraTi'
import type { DayId } from '@calistenia/core/types'

export default function TodayScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { activeProgram, weekDays, programsReady } = useWorkoutState()
  const { getWorkout, isWorkoutDone } = useWorkoutActions()
  const { unreadCount, loadNotifications } = useNotifications(user?.id ?? null)
  const view = useHomeView()
  const { state, today, phase, accountSessions, dayHasContent } = view
  const actions = useHomeActions(phase)
  const loading = state.modifiers.loading

  useEffect(() => {
    if (user?.id) loadNotifications()
  }, [user?.id, loadNotifications])

  // Ni la encuesta de descubrimiento ni las novedades antes del primer entreno.
  const hasTrained = accountSessions > 0 && !loading
  useEffect(() => setAccountHasTrained(hasTrained), [hasTrained])

  // ── Días del programa que se pueden elegir con «Cambiar día» ──
  const dayRefs = useMemo(() => {
    if (!activeProgram) return []
    const trainable = WEEK_ORDER
      .map(id => weekDays.find(d => d.id === id))
      .filter((d): d is NonNullable<typeof d> => isTrainableDay(d))
    return trainable
      .filter(dayHasContent)
      .map((d): HomeDayRef => ({
        dayId: d.id,
        date: today,
        workoutKey: `p${phase}_${d.id}`,
        dayType: homeDayType(d.type),
        index: trainable.findIndex(x => x.id === d.id) + 1,
        of: trainable.length,
      }))
  }, [activeProgram, weekDays, dayHasContent, phase, today])

  const [chosenDay, setChosenDay] = useState<HomeDayRef | null>(null)
  const [changeDayOpen, setChangeDayOpen] = useState(false)
  const shownDayId = chosenDay?.dayId
    ?? (state.kind === 'training_day' || state.kind === 'comeback' ? state.day?.dayId : null)
  const canChangeDay = dayRefs.length > 1

  // ── Analítica (#854): una vista por foco, con el estado ya resuelto ──
  const [focused, setFocused] = useState(false)
  const viewedRef = useRef(false)
  useFocusEffect(useCallback(() => {
    setFocused(true)
    return () => {
      setFocused(false)
      viewedRef.current = false
      resetHomeView()
      // Al volver, el bloque enseña otra vez el día de hoy.
      setChosenDay(null)
    }
  }, []))
  useEffect(() => {
    if (!focused || loading || viewedRef.current) return
    viewedRef.current = true
    trackHomeViewed({ state: state.kind, modifiers: homeAnalyticsModifiers(state) })
  }, [focused, loading, state])

  const onPrimary = useCallback((run: () => void) => {
    trackHomePrimaryCta({ state: state.kind })
    run()
  }, [state.kind])
  const onSecondary = useCallback((target: HomeSecondaryTarget, run: () => void) => {
    trackHomeSecondaryTap({ target, state: state.kind })
    run()
  }, [state.kind])
  const onParaTi = useCallback((kind: ParaTiKind, run: () => void) => {
    trackHomeParaTiTap({ kind })
    run()
  }, [])
  const openChangeDay = useCallback(() => {
    trackHomeChangeDay()
    setChangeDayOpen(true)
  }, [])
  const chooseDay = useCallback((day: HomeDayRef) => {
    // Desde «Siguiente» / «Ver entreno»: el día se enseña, no se arranca.
    onSecondary('next_day', () => setChosenDay(day))
  }, [onSecondary])

  // ── Denominador del embudo (#636 §3): el entreno de hoy del programa ──
  const todayId = dayIdFromDateStr(today) as DayId
  const todayKey = `p${phase}_${todayId}`
  const todayWorkout = useMemo(() => getWorkout(phase, todayId), [getWorkout, phase, todayId])
  useEffect(() => {
    if (!todayWorkout || todayWorkout.exercises.length === 0) return
    trackWorkoutDayViewed({
      workoutKey: todayKey,
      source: 'program',
      exerciseCount: todayWorkout.exercises.length,
      plannedSets: plannedSetCount(todayWorkout.exercises),
      alreadyDone: isWorkoutDone(todayKey),
    })
  }, [todayKey]) // eslint-disable-line react-hooks/exhaustive-deps -- una vista por día

  // ── Push con `autostart=1` (#695, #807): arranca el entreno de hoy ──
  // Se deja como estaba: quien toca el aviso ya decidió entrenar. El cardio
  // del programa se abre aunque ya esté hecho (antes también).
  const { autostart } = useLocalSearchParams<{ autostart?: string }>()
  const autostartFiredFor = useRef<string | null>(null)
  useEffect(() => {
    if (autostart !== '1') {
      autostartFiredFor.current = null
      return
    }
    if (!programsReady) return
    if (autostartFiredFor.current === autostart) return
    autostartFiredFor.current = autostart
    const ref = dayRefs.find(d => d.dayId === todayId)
    if (ref && (ref.dayType === 'cardio' || !isWorkoutDone(ref.workoutKey))) actions.startDay(ref)
    router.setParams({ autostart: undefined })
  }, [autostart, programsReady]) // eslint-disable-line react-hooks/exhaustive-deps -- handlers recreados cada render

  const dayName = (id: DayId) => t(`day.${id}`)
  const changeDayOptions = dayRefs
    .filter(d => d.dayId !== shownDayId)
    .map(d => {
      const w = getWorkout(phase, d.dayId)
      const focus = weekDays.find(x => x.id === d.dayId)?.focus
      const title = d.dayType === 'cardio' ? t('cardio.title') : w?.title || focus
      return {
        key: d.dayId,
        label: title ? `${dayName(d.dayId)} · ${title}` : dayName(d.dayId),
        onPress: () => setChosenDay(d.dayId === todayId && state.kind === 'training_day' ? null : d),
      }
    })

  const showParaTi = !!user?.id && !loading && paraTiEnabled({ homeKind: state.kind, accountSessions })

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-5 pb-8 pt-2">
        <HomeHeader unreadCount={unreadCount} />

        <TodayBlock
          view={view}
          chosenDay={chosenDay}
          actions={actions}
          onChangeDay={canChangeDay ? openChangeDay : null}
          onBackToToday={() => setChosenDay(null)}
          onChooseDay={chooseDay}
          onPrimary={onPrimary}
          onSecondary={onSecondary}
        />

        {state.kind === 'first_workout' ? (
          state.showActivationGoal && state.modifiers.firstWeek ? (
            <FirstWeekGoal goal={state.modifiers.firstWeek} start />
          ) : null
        ) : !loading ? (
          <WeekRow view={view} />
        ) : null}

        {showParaTi ? (
          <ParaTi
            userId={user!.id}
            homeKind={state.kind}
            accountSessions={accountSessions}
            today={today}
            onTap={onParaTi}
          />
        ) : null}
      </ScrollView>

      <OptionSheet
        visible={changeDayOpen}
        kicker={t('home.action.changeDay')}
        title={t('home.changeDay.title')}
        options={changeDayOptions}
        cancelLabel={t('common.cancel')}
        onClose={() => setChangeDayOpen(false)}
      />

      {/* Hito de racha SEMANAL: nunca encima de una actividad en curso. */}
      {user && hasTrained && state.kind !== 'in_progress' && view.streak.current > 0 ? (
        <StreakMilestone
          weeks={view.streak.current}
          userId={user.id}
          userName={(user.display_name as string) || (user.name as string) || t('race.athlete')}
          referralCode={(user.referral_code as string) || null}
        />
      ) : null}

      {/* Novedades: como mucho una vez por versión y nunca antes del primer entreno. */}
      {hasTrained ? <WhatsNewModal /> : null}
    </SafeAreaView>
  )
}
