/**
 * Bloque «Hoy» del inicio (#858): una variante por `kind` de `getHomeState`
 * (#853). Cada una es un tablero del lienzo de #852 (Main, Cardio, Descarga,
 * Dia0, EnCurso, Hecho, Descanso, SemanaCompleta, Vuelta, SinPrograma,
 * ProgramaTerminado). Aquí no se decide el estado: solo se pinta.
 *
 * Los toques pasan por `onPrimary` / `onSecondary`, que pone la pantalla con
 * la analítica (#854) delante.
 */
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { useCircuitSession } from '@/contexts/CircuitSessionContext'
import { useAuthUser } from '@/lib/use-auth-user'
import { useBattleProgramDay } from '@/lib/use-battle-program-day'
import { useStartFirstWorkout } from '@/lib/start-first-workout'
import type { HomeView } from '@/lib/use-home-state'
import type { useHomeActions } from '@/lib/use-home-actions'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { calculateWorkoutDuration } from '@calistenia/core/lib/duration'
import { formatPace } from '@calistenia/core/lib/geo'
import { localizeReps } from '@calistenia/core/lib/localize-reps'
import { plannedSetCount } from '@calistenia/core/lib/session-funnel'
import { dayIdFromDateStr } from '@calistenia/core/lib/programProgress'
import { shiftDay } from '@calistenia/core/lib/calendarWeek'
import {
  buildFirstWorkout,
  estimateFirstWorkoutMinutes,
  normalizeFirstWorkoutLevel,
} from '@calistenia/core/lib/first-workout'
import type { HomeActiveActivity, HomeDayRef, HomeState } from '@calistenia/core/lib/homeState'
import type { HomeSecondaryTarget } from '@calistenia/core/lib/home-analytics'
import type { Exercise, SessionDone } from '@calistenia/core/types'
import {
  ChangeDayAction,
  LinkRow,
  PrimaryAction,
  TextAction,
  TodayBar,
  TodayBody,
  TodayCard,
  TodayKicker,
  TodayMeta,
  TodayRows,
  TodayStats,
  TodayTitle,
  type TodayRow,
} from './today-parts'

type Actions = ReturnType<typeof useHomeActions>

export interface TodayBlockProps {
  view: HomeView
  /** Día elegido con «Cambiar día» / «Ver entreno»; manda sobre el estado. */
  chosenDay: HomeDayRef | null
  actions: Actions
  onChangeDay: (() => void) | null
  onBackToToday: () => void
  onChooseDay: (day: HomeDayRef) => void
  onPrimary: (run: () => void) => void
  onSecondary: (target: HomeSecondaryTarget, run: () => void) => void
}

const MAX_ROWS = 3

function exerciseRows(exercises: readonly Exercise[], lang: string): TodayRow[] {
  return exercises.slice(0, MAX_ROWS).map((ex, i) => ({
    key: `${ex.id}_${i}`,
    name: ex.name,
    detail: `${ex.sets} × ${localizeReps(ex.reps, lang)}`,
  }))
}

export default function TodayBlock(props: TodayBlockProps) {
  const { view, chosenDay } = props
  const s = view.state
  if (s.modifiers.loading) return <TodaySkeleton />
  if (s.kind === 'in_progress') return <InProgressToday {...props} state={s} />
  if (chosenDay) return <TrainingToday {...props} day={chosenDay} chosen />

  switch (s.kind) {
    case 'first_workout':
      return <FirstWorkoutToday {...props} />
    case 'training_day':
      return <TrainingToday {...props} day={s.day} deload={s.deload} />
    case 'comeback':
      return <ComebackToday {...props} state={s} />
    case 'done_today':
      return <DoneToday {...props} state={s} />
    case 'rest_day':
    case 'week_complete':
      return <RestToday {...props} state={s} />
    case 'no_program':
      return <NoProgramToday {...props} />
    case 'program_complete':
      return <ProgramCompleteToday {...props} />
  }
}

/** Esqueleto con la altura del bloque de un día de entreno: nada salta al cargar. */
function TodaySkeleton() {
  return <Skeleton className="h-[380px] w-full rounded-xl" />
}

function useDayName() {
  const { t } = useTranslation()
  // `inSentence`: «el jueves», en minúscula donde el idioma la pide.
  return (dayId: string | null | undefined, inSentence = false) =>
    dayId ? t(inSentence ? `day.inSentence.${dayId}` : `day.${dayId}`) : ''
}

// ── Día de entreno (Main · Cardio · Descarga) y día elegido ────────────────

function TrainingToday({ view, day, chosen, deload, actions, onChangeDay, onBackToToday, onPrimary, header }: TodayBlockProps & {
  day: HomeDayRef
  chosen?: boolean
  deload?: boolean
  /** Cabecera propia (Vuelta); por defecto, «Hoy · día N de M». */
  header?: React.ReactNode
}) {
  const { t, i18n } = useTranslation()
  const l = useLocalize()
  const dayName = useDayName()
  const { activeProgram, phases, programProgress, cardioDayConfigs, circuitDayConfigs, weekDays } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  const inactive = view.state.modifiers.inactiveDays
  const battleDay = useBattleProgramDay()
  const router = useRouter()

  const weekDay = weekDays.find(d => d.id === day.dayId)
  const workout = getWorkout(view.phase, day.dayId)
  const cardio = cardioDayConfigs[day.workoutKey]
  const circuit = circuitDayConfigs[day.workoutKey]

  const kickerKey = {
    strength: 'home.kicker.today',
    cardio: 'home.kicker.todayCardio',
    circuit: 'home.kicker.todayCircuit',
    yoga: 'home.kicker.todayYoga',
  }[day.dayType]
  const kicker = chosen
    ? t('home.kicker.chosenDay', { day: dayName(day.dayId, true) })
    : t(kickerKey, { index: day.index, total: day.of })

  let title: string
  let meta: string | null = null
  let rows: TodayRow[] = []
  let primary: string
  if (day.dayType === 'cardio') {
    title = `${t('cardio.title')} · ${t(`cardio.${cardio?.activityType ?? 'running'}`)}`
    primary = t('home.action.startCardio')
  } else if (day.dayType === 'circuit') {
    title = circuit ? l(circuit.name) : t('circuit.modes.circuit')
    meta = circuit ? t('circuit.summary', { rounds: circuit.rounds, exercises: circuit.exercises.length }) : null
    rows = (circuit?.exercises ?? []).slice(0, MAX_ROWS).map((ex, i) => ({
      key: `${ex.exerciseId}_${i}`,
      name: l(ex.name),
      detail: ex.reps ? localizeReps(ex.reps, i18n.language) : undefined,
    }))
    primary = t('home.action.startCircuit')
  } else {
    const exercises = workout?.exercises ?? []
    title = workout?.title || weekDay?.focus || weekDay?.name || t('dashboard.train')
    meta = t('home.training.meta', {
      minutes: calculateWorkoutDuration(exercises),
      exercises: t('workout.exerciseCount', { count: exercises.length }),
    })
    rows = exerciseRows(exercises, i18n.language)
    primary = day.dayType === 'yoga' ? t('home.action.startYoga') : t('home.action.start')
  }

  const phaseCount = phases.length
  const week = programProgress.hasStarted ? programProgress.currentWeek : null

  return (
    <TodayCard label={title}>
      {header ?? (
        <TodayKicker
          action={chosen
            ? <TextAction mono label={t('home.action.backToToday')} onPress={onBackToToday} className="pr-0" />
            : onChangeDay
              ? <ChangeDayAction label={t('home.action.changeDay')} onPress={onChangeDay} />
              : null}
        >
          {kicker}
        </TodayKicker>
      )}
      {inactive != null && !chosen ? (
        <TodayMeta>{t('home.inactive', { count: inactive })}</TodayMeta>
      ) : null}
      {deload && !chosen ? (
        <TodayMeta>{t('home.deload.banner')}</TodayMeta>
      ) : null}
      <View className="gap-1.5">
        <TodayTitle>{title}</TodayTitle>
        {meta ? <TodayMeta>{meta}</TodayMeta> : null}
      </View>
      {day.dayType === 'cardio' ? (
        <>
          {cardio?.targetDistanceKm || cardio?.targetDurationMin ? (
            <TodayStats
              items={[
                ...(cardio.targetDistanceKm ? [{ key: 'km', value: `${cardio.targetDistanceKm} km`, label: t('home.cardio.target') }] : []),
                ...(cardio.targetDurationMin ? [{ key: 'min', value: `${cardio.targetDurationMin} min`, label: t('home.cardio.duration') }] : []),
              ]}
            />
          ) : null}
          {cardio?.targetDistanceKm ? <TodayBody>{t('home.cardio.gpsHint', { km: cardio.targetDistanceKm })}</TodayBody> : null}
        </>
      ) : (
        <TodayRows rows={rows} />
      )}
      {activeProgram && week != null ? (
        <View className="gap-1.5">
          {/* El nombre del programa se recorta; la semana no se mueve. */}
          <View className="flex-row justify-between gap-3">
            <TodayMeta numberOfLines={1} className="flex-1">
              {t('home.training.programPhase', { program: activeProgram.name, phase: view.phase, phases: phaseCount })}
            </TodayMeta>
            <TodayMeta className="shrink-0">{t('home.training.programWeek', { week, weeks: programProgress.totalWeeks })}</TodayMeta>
          </View>
          <TodayBar percent={programProgress.percent} />
        </View>
      ) : null}
      <PrimaryAction label={primary} onPress={() => onPrimary(() => actions.startDay(day))} />
      {/* Segunda entrada a «otro día», al alcance del pulgar (QA #858). */}
      {!chosen && !header && onChangeDay ? (
        <TextAction label={t('home.action.chooseOtherDay')} onPress={onChangeDay} className="-my-2 self-center" />
      ) : null}
      {/* Solo si el día se puede jugar como batalla (#882): fuerza con ejercicios. */}
      {day.dayType === 'strength' && battleDay.convert(day.dayId, { phase: view.phase })?.ok ? (
        <TextAction
          label={t('battle.challengeFriend')}
          onPress={() => router.push({
            pathname: '/battle-create',
            params: { origin: 'program_day', phase: String(view.phase), day: day.dayId },
          })}
          className="-my-2 self-center"
        />
      ) : null}
    </TodayCard>
  )
}

// ── Vuelta tras un parón ───────────────────────────────────────────────────

function ComebackToday(props: TodayBlockProps & { state: Extract<HomeState, { kind: 'comeback' }> }) {
  const { t } = useTranslation()
  const { state, onChangeDay } = props
  const monday = dayIdFromDateStr(props.view.today) === 'lun'
  const header = (
    <View className="gap-2">
      <TodayKicker>{monday ? t('home.kicker.comebackNewWeek') : t('home.kicker.comeback')}</TodayKicker>
      <TodayTitle>{t('home.comeback.title')}</TodayTitle>
      <TodayBody>{t('home.comeback.body', { count: state.daysSinceLast })}</TodayBody>
    </View>
  )
  if (!state.day) {
    return <NoProgramToday {...props} />
  }
  return (
    <View className="gap-1">
      <TrainingToday {...props} day={state.day} header={header} onChangeDay={null} />
      {onChangeDay ? (
        <TextAction label={t('home.action.chooseOtherDay')} onPress={onChangeDay} className="self-center" />
      ) : null}
    </View>
  )
}

// ── Día 0: primer entreno curado (#694) ────────────────────────────────────

function FirstWorkoutToday({ onPrimary, onSecondary }: TodayBlockProps) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { activeProgram } = useWorkoutState()
  const startFirstWorkout = useStartFirstWorkout()
  const level = normalizeFirstWorkoutLevel(user?.level as string | undefined)
  const minutes = estimateFirstWorkoutMinutes(level)
  const workout = buildFirstWorkout(level, i18n.language)

  return (
    <View className="gap-5">
      <TodayCard label={t('home.firstWorkout.title')}>
        <TodayKicker>{t('home.kicker.firstWorkout')}</TodayKicker>
        <View className="gap-1.5">
          <TodayTitle size="lg">{t('home.firstWorkout.title')}</TodayTitle>
          <TodayMeta>
            {t('home.training.meta', { minutes, exercises: t('workout.exerciseCount', { count: workout.exercises.length }) })}
          </TodayMeta>
        </View>
        <TodayRows rows={exerciseRows(workout.exercises, i18n.language)} />
        <TodayBody>{t('home.firstWorkout.body')}</TodayBody>
        <PrimaryAction
          label={t('home.action.startMinutes', { minutes })}
          onPress={() => onPrimary(() => startFirstWorkout(user?.level as string | undefined, 'home'))}
        />
      </TodayCard>
      {activeProgram ? (
        <View className="border-t border-border">
          <LinkRow
            kicker={t('home.firstWorkout.preferProgram')}
            title={t('home.firstWorkout.programDay', { program: activeProgram.name, day: 1 })}
            onPress={() => onSecondary('other_program', () => router.push(`/program/${activeProgram.id}`))}
          />
        </View>
      ) : null}
    </View>
  )
}

// ── En curso (fuerza, libre, cardio, circuito, batalla) ────────────────────

function InProgressToday({ state, actions, onPrimary }: TodayBlockProps & { state: Extract<HomeState, { kind: 'in_progress' }> }) {
  const { t } = useTranslation()
  const l = useLocalize()
  const dayName = useDayName()
  const session = useActiveSession()
  const circuit = useCircuitSession()
  const activity = state.activity

  // El progreso de la sesión se lee sin suscribirse (#475): basta con
  // refrescarlo al volver a la pestaña.
  const [setsDone, setSetsDone] = useState(() => session.getProgressSnapshot().setsCount)
  useFocusEffect(useCallback(() => {
    setSetsDone(session.getProgressSnapshot().setsCount)
  }, [session]))

  const startedAt = activity.type === 'circuit' ? circuit.startedAt
    : activity.type === 'strength' || activity.type === 'free' ? session.startedAt
    : null
  const kicker = state.fromAnotherDay && activity.startedDay
    ? t('home.kicker.inProgressOtherDay', { day: dayName(dayIdFromDateStr(activity.startedDay), true) })
    : startedAt
      ? t('home.kicker.inProgress', { minutes: Math.max(1, Math.round((Date.now() - startedAt) / 60_000)) })
      : t('home.kicker.inProgressNow')

  let title: string
  let primary: string
  let progress: { done: number; total: number } | null = null
  switch (activity.type) {
    case 'battle':
      title = t('battle.kicker')
      primary = t('home.inProgress.continueBattle')
      break
    case 'cardio':
      title = t('cardio.title')
      primary = t('home.inProgress.continueCardio')
      break
    case 'circuit':
      title = circuit.circuit ? l(circuit.circuit.name) : t('circuit.modes.circuit')
      primary = t('home.inProgress.continueCircuit')
      break
    default: {
      title = session.workout?.title || t('session.session')
      primary = activity.type === 'free' ? t('home.inProgress.continueFree') : t('home.action.continue')
      const total = session.workout ? plannedSetCount(session.workout.exercises) : 0
      if (total > 0) progress = { done: Math.min(setsDone, total), total }
    }
  }
  const canDiscard = activity.type === 'strength' || activity.type === 'free' || activity.type === 'circuit'

  return (
    <TodayCard label={title}>
      <TodayKicker dot>{kicker}</TodayKicker>
      <TodayTitle>{title}</TodayTitle>
      {progress ? (
        <View className="gap-1.5">
          <TodayMeta>{t('home.inProgress.sets', progress)}</TodayMeta>
          <TodayBar tone="lime" percent={(progress.done / progress.total) * 100} />
        </View>
      ) : null}
      <PrimaryAction label={primary} onPress={() => onPrimary(() => actions.continueActivity(activity))} />
      {canDiscard ? (
        <TextAction
          label={t('home.action.discard')}
          onPress={() => actions.discardActivity(activity as HomeActiveActivity)}
          className="-my-2 self-center"
        />
      ) : null}
    </TodayCard>
  )
}

// ── Hecho hoy ──────────────────────────────────────────────────────────────

function NextDayRow({ next, today, phase, onChoose }: { next: HomeDayRef; today: string; phase: number; onChoose: () => void }) {
  const { t } = useTranslation()
  const dayName = useDayName()
  const { getWorkout } = useWorkoutActions()
  const { weekDays, cardioDayConfigs } = useWorkoutState()
  const tomorrow = next.date === shiftDay(today, 1)
  const name = dayName(next.dayId, true)
  const workout = getWorkout(phase, next.dayId)
  const weekDay = weekDays.find(d => d.id === next.dayId)
  const title = next.dayType === 'cardio'
    ? `${t('cardio.title')} · ${t(`cardio.${cardioDayConfigs[next.workoutKey]?.activityType ?? 'running'}`)}`
    : workout?.title || weekDay?.focus || weekDay?.name || name
  const hint = workout && next.dayType !== 'cardio'
    ? t('home.training.meta', {
        minutes: calculateWorkoutDuration(workout.exercises),
        exercises: t('workout.exerciseCount', { count: workout.exercises.length }),
      })
    : undefined
  return (
    <View className="border-t border-border">
      <LinkRow
        kicker={tomorrow ? t('home.next.tomorrow', { day: name }) : t('home.next.label', { day: name })}
        title={title}
        hint={hint}
        onPress={onChoose}
      />
    </View>
  )
}

function DoneToday({ view, state, actions, onSecondary, onChooseDay }: TodayBlockProps & { state: Extract<HomeState, { kind: 'done_today' }> }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { progress, weekDays } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  const day = state.day
  const workout = getWorkout(view.phase, day.dayId)
  const weekDay = weekDays.find(d => d.id === day.dayId)
  const entry = progress[`done_${view.today}_${day.workoutKey}`] as SessionDone | undefined

  let title: string
  let stats: { key: string; value: string; label: string }[] = []
  if (state.variant === 'cardio') {
    const c = view.todayCardio
    title = t('cardio.title')
    if (c) {
      stats = [
        { key: 'km', value: c.distance_km.toFixed(1), label: t('home.cardio.distance') },
        { key: 'min', value: String(Math.round(c.duration_seconds / 60)), label: t('home.cardio.minutes') },
        ...(c.avg_pace > 0 ? [{ key: 'pace', value: formatPace(c.avg_pace), label: t('home.cardio.pace') }] : []),
      ]
    }
  } else {
    title = workout?.title || weekDay?.focus || weekDay?.name || t('dashboard.completed')
    const minutes = entry?.durationSeconds ? Math.round(entry.durationSeconds / 60) : null
    stats = [
      ...(minutes ? [{ key: 'min', value: String(minutes), label: t('home.done.minutes') }] : []),
      ...(workout ? [{ key: 'sets', value: String(plannedSetCount(workout.exercises)), label: t('home.done.sets') }] : []),
    ]
  }
  const canRepeat = state.variant === 'default' && day.dayType !== 'circuit' && !!workout?.exercises.length

  return (
    <View className="gap-0">
      <TodayCard label={title}>
        <TodayKicker>{t('home.kicker.doneToday')}</TodayKicker>
        <TodayTitle>{title}</TodayTitle>
        {stats.length ? <TodayStats items={stats} /> : null}
        <View className="-my-1 flex-row flex-wrap items-center">
          {entry && state.variant === 'default' ? (
            <TextAction
              className="pl-0"
              label={t('home.action.viewSummary')}
              onPress={() => onSecondary('summary', () => router.push({
                pathname: '/session-detail',
                params: { date: view.today, workoutKey: day.workoutKey, title },
              }))}
            />
          ) : null}
          {canRepeat ? (
            <TextAction
              label={t('home.action.repeat')}
              onPress={() => onSecondary('repeat', () => actions.startDay(day))}
            />
          ) : null}
        </View>
      </TodayCard>
      {state.next ? (
        <View className="mt-5">
          <NextDayRow next={state.next} today={view.today} phase={view.phase} onChoose={() => onChooseDay(state.next!)} />
        </View>
      ) : null}
    </View>
  )
}

// ── Descanso · Semana completada ───────────────────────────────────────────

function RestToday({ view, state, onChooseDay }: TodayBlockProps & {
  state: Extract<HomeState, { kind: 'rest_day' | 'week_complete' }>
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const dayName = useDayName()
  const { weekDays } = useWorkoutState()
  const next = state.next
  const nextFocus = next ? weekDays.find(d => d.id === next.dayId)?.focus : null
  const complete = state.kind === 'week_complete'

  const kicker = complete
    ? t('home.kicker.weekCompleteNoNumber', { done: view.week.done, goal: view.weeklyGoal })
    : t('home.kicker.rest')
  const title = complete ? t('home.weekComplete.title') : t('home.rest.title')
  const body = complete
    ? t('home.weekComplete.body', { count: Math.max(1, view.streak.current) })
    : state.kind === 'rest_day' && state.comingSoon
      ? t('home.rest.comingSoon')
      : next && nextFocus
        ? t('home.rest.bodyNext', {
            day: next.date === shiftDay(view.today, 1) ? t('home.next.tomorrowShort') : dayName(next.dayId),
            focus: nextFocus.toLowerCase(),
          })
        : t('home.rest.body')

  return (
    <View className="gap-5">
      <TodayCard label={title}>
        <TodayKicker>{kicker}</TodayKicker>
        <TodayTitle>{title}</TodayTitle>
        <TodayBody>{body}</TodayBody>
        {next ? (
          <NextDayRow next={next} today={view.today} phase={view.phase} onChoose={() => onChooseDay(next)} />
        ) : null}
      </TodayCard>
      {!complete ? (
        <View className="gap-2">
          <TodayMeta>{t('home.rest.moveOptional')}</TodayMeta>
          <View className="border-t border-border">
            <LinkRow
              title={t('home.rest.easyCardio')}
              hint={t('home.rest.easyCardioHint')}
              onPress={() => router.push('/cardio')}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

// ── Sin programa · Programa terminado ──────────────────────────────────────

function NoProgramToday({ onPrimary }: TodayBlockProps) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <View className="gap-5">
      <TodayCard label={t('home.noProgram.title')}>
        <TodayKicker>{t('home.kicker.noProgram')}</TodayKicker>
        <TodayTitle>{t('home.noProgram.title')}</TodayTitle>
        <PrimaryAction icon={false} label={t('home.action.choosePrograms')} onPress={() => onPrimary(() => router.push('/programs'))} />
      </TodayCard>
      <View className="border-t border-border">
        <LinkRow
          kicker={t('home.noProgram.freeTitle')}
          title={t('home.noProgram.freeBody')}
          onPress={() => router.push('/free-session')}
        />
      </View>
    </View>
  )
}

function ProgramCompleteToday({ onPrimary }: TodayBlockProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { activeProgram, programProgress } = useWorkoutState()
  const { getTotalSessions } = useWorkoutActions()
  const name = activeProgram?.name ?? ''
  return (
    <TodayCard label={t('home.programComplete.title', { name })}>
      <TodayKicker>{t('home.kicker.programComplete')}</TodayKicker>
      <TodayTitle>{t('home.programComplete.title', { name })}</TodayTitle>
      <TodayStats
        items={[
          { key: 'weeks', value: String(programProgress.totalWeeks), label: t('home.programComplete.weeks') },
          { key: 'workouts', value: String(getTotalSessions()), label: t('home.programComplete.workouts') },
        ]}
      />
      <PrimaryAction icon={false} label={t('home.action.choosePrograms')} onPress={() => onPrimary(() => router.push('/programs'))} />
    </TodayCard>
  )
}
