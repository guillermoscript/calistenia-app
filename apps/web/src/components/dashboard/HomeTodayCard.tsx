/**
 * Bloque «Hoy» del inicio (#855, épica #852).
 *
 * Pinta el `HomeState` de `getHomeState` (#853): un tablero del lienzo por
 * `kind`. Reglas que no se negocian (issue #855):
 * - Un solo botón principal por pantalla, `<Button>` en la variante por defecto
 *   (`primary`: casi blanco en oscuro, casi negro en claro), 56 px de alto. El
 *   lima NUNCA va en botones: solo en el borde del bloque y en el kicker.
 * - Todo lo pulsable mide al menos 44 px.
 * - Mientras `loading`, esqueleto a la misma altura (nunca bloques vacíos).
 *
 * Cada acción emite su evento del contrato de #854 (`home_primary_cta`,
 * `home_change_day`, `home_secondary_tap`).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ChevronRight, Play, Footprints, StretchHorizontal } from 'lucide-react'
import { Button } from '../ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { cn } from '../../lib/utils'
import { shareContent, shareWorkoutSession } from '../../lib/share'
import DiscardSessionDialog from '../session/DiscardSessionDialog'
import { useWorkoutActions, useWorkoutState } from '../../contexts/WorkoutContext'
import { useAuthState } from '../../contexts/AuthContext'
import { useActiveSession } from '../../contexts/ActiveSessionContext'
import { useCardioSessionContext } from '../../contexts/CardioSessionContext'
import { useCircuitSession } from '../../contexts/CircuitSessionContext'
import { useActiveBattle } from '@calistenia/core/hooks/useActiveBattle'
import { useBattleProgramDay } from '../../hooks/useBattleProgramDay'
import { calculateWorkoutDuration } from '@calistenia/core/lib/duration'
import { localize } from '@calistenia/core/lib/i18n-db'
import { shiftDay } from '@calistenia/core/lib/calendarWeek'
import { WEEK_ORDER, isTrainableDay } from '@calistenia/core/lib/training-day'
import { plannedSetCount } from '@calistenia/core/lib/session-funnel'
import { utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { formatPace } from '@calistenia/core/lib/geo'
import {
  buildFirstWorkout,
  estimateFirstWorkoutMinutes,
  markFirstWorkoutPending,
  normalizeFirstWorkoutLevel,
} from '@calistenia/core/lib/first-workout'
import {
  trackHomeChangeDay,
  trackHomePrimaryCta,
  trackHomeSecondaryTap,
  type HomeSecondaryTarget,
} from '@calistenia/core/lib/home-analytics'
import { dayHasContent, homeDayType, type HomeDayRef, type HomeState } from '@calistenia/core/lib/homeState'
import type { CardioSession, Exercise, SessionDone, ProgramMeta, WeekDay, Workout } from '@calistenia/core/types'
import type { HomeToday } from './useHomeToday'

// ── Piezas comunes ──────────────────────────────────────────────────────────

function Kicker({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-text">{children}</span>
}

function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[11px] uppercase tracking-wider text-muted-foreground', className)}>{children}</span>
}

function Title({ children }: { children: ReactNode }) {
  return <h2 id="home-today-title" className="m-0 font-bebas text-[40px] leading-[0.95] lg:text-6xl">{children}</h2>
}

/** El único botón `primary` del inicio. */
function PrimaryAction({ onClick, children, icon = true }: { onClick: () => void; children: ReactNode; icon?: boolean }) {
  return (
    <Button
      onClick={onClick}
      data-testid="home-primary"
      className="h-14 w-full gap-2.5 rounded-[10px] font-bebas text-2xl tracking-wide lg:w-auto lg:shrink-0 lg:px-8 [&_svg]:size-[18px]"
    >
      {icon && <Play fill="currentColor" aria-hidden="true" />}
      <span className="pt-[3px]">{children}</span>
    </Button>
  )
}

/** Acción secundaria con contorno (44 px). */
function SecondaryAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="outline" onClick={onClick} className="h-11 flex-1 rounded-[10px] text-[13px]">
      {children}
    </Button>
  )
}

/** Enlace de texto subrayado con área táctil de 44 px («Cambiar día»). */
function TextAction({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-11 bg-transparent font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground underline underline-offset-[3px] hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Shell({ label, accent, children, testState }: { label: string; accent: boolean; children: ReactNode; testState: string }) {
  return (
    <section
      aria-label={label}
      data-testid="home-today"
      data-state={testState}
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4 lg:gap-[18px] lg:rounded-[14px] lg:px-7 lg:py-[26px]',
        accent ? 'border-lime/40' : 'border-border',
      )}
    >
      {children}
    </section>
  )
}

/** Rejilla de 3 celdas con filetes (diseño «Hecho hoy»): números Bebas, etiquetas mono. */
function StatGrid({ items }: { items: { value: ReactNode; label: string }[] }) {
  return (
    <dl className="m-0 grid border-y border-border" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} data-testid="home-done-stats">
      {items.map((item, i) => (
        <div key={item.label} className={cn('flex flex-col gap-0.5 py-3', i > 0 && 'border-l border-border pl-3.5')}>
          <dd className="m-0 font-bebas text-[32px] leading-none">{item.value}</dd>
          <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</dt>
        </div>
      ))}
    </dl>
  )
}

function Stats({ items }: { items: { value: ReactNode; label: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map(item => (
        <div key={item.label} className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2.5">
          <dd className="m-0 font-bebas text-3xl leading-none">{item.value}</dd>
          <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</dt>
        </div>
      ))}
    </dl>
  )
}

function mainExercises(workout: Workout | null): Exercise[] {
  return (workout?.exercises ?? []).filter(e => !e.section || e.section === 'main')
}

function setsReps(ex: Exercise): string {
  return ex.isTimer && ex.timerSeconds ? `${ex.sets} × ${ex.timerSeconds} s` : `${ex.sets} × ${ex.reps}`
}

/** 3 ejercicios en móvil; en escritorio la tabla entera con descansos. */
function ExerciseList({ workout, compactOnly = false }: { workout: Workout | null; compactOnly?: boolean }) {
  const { t } = useTranslation()
  const main = mainExercises(workout)
  if (!main.length) return null
  const warmup = (workout?.exercises ?? []).filter(e => e.section === 'warmup').length
  const cooldown = (workout?.exercises ?? []).filter(e => e.section === 'cooldown').length
  return (
    <>
      <ul className={cn('m-0 flex list-none flex-col p-0', !compactOnly && 'lg:hidden')}>
        {main.slice(0, 3).map((ex, i) => (
          <li key={`${ex.id}-${i}`} className={cn('flex h-8 items-center justify-between gap-3 border-t border-border text-sm', i === Math.min(main.length, 3) - 1 && 'border-b')}>
            <span className="truncate">{ex.name}</span>
            <Meta className="shrink-0 text-[11px]">{setsReps(ex)}</Meta>
          </li>
        ))}
      </ul>
      {!compactOnly && (
        <table className="hidden w-full border-collapse text-sm lg:table">
          <thead>
            <tr className="h-[30px]">
              <th scope="col" className="text-left font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground">{t('home.table.exercise')}</th>
              <th scope="col" className="text-right font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground">{t('home.table.setsReps')}</th>
              <th scope="col" className="w-[110px] text-right font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground">{t('home.table.rest')}</th>
            </tr>
          </thead>
          <tbody>
            {warmup > 0 && (
              <tr className="h-10 border-t border-border text-muted-foreground">
                <td>{t('home.inProgress.warmup', { count: warmup })}</td>
                <td className="text-right font-mono text-[11px]">—</td>
                <td className="text-right font-mono text-[11px]">—</td>
              </tr>
            )}
            {main.map((ex, i) => (
              <tr key={`${ex.id}-${i}`} className="h-10 border-t border-border">
                <td>{ex.name}</td>
                <td className="text-right font-mono text-[11px] tracking-wider">{setsReps(ex)}</td>
                <td className="text-right font-mono text-[11px] tracking-wider text-muted-foreground">{ex.rest ? `${ex.rest} s` : '—'}</td>
              </tr>
            ))}
            {cooldown > 0 && (
              <tr className="h-10 border-y border-border text-muted-foreground">
                <td>{t('home.table.cooldown', { count: cooldown })}</td>
                <td className="text-right font-mono text-[11px]">—</td>
                <td className="text-right font-mono text-[11px]">—</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  )
}

function weekdayOf(date: string, locale: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long' })
}

function focusOfDay(t: (k: string) => string, weekDays: readonly WeekDay[], dayId: string): string {
  const day = weekDays.find(d => d.id === dayId)
  return day?.focusKey ? t(day.focusKey) : day?.focus || ''
}

// ── Componente ──────────────────────────────────────────────────────────────

interface HomeTodayCardProps {
  home: HomeToday
  cardioLastSession?: CardioSession | null
}

export default function HomeTodayCard({ home, cardioLastSession }: HomeTodayCardProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { activeProgram, programs, phases, weekDays, programProgress, progress } = useWorkoutState()
  const { selectProgram, getTotalSessions } = useWorkoutActions()
  const { user, userId } = useAuthState()
  const strength = useActiveSession()
  const cardio = useCardioSessionContext()
  const circuit = useCircuitSession()
  const [discardOpen, setDiscardOpen] = useState(false)
  const battleDay = useBattleProgramDay()
  const { data: activeBattle } = useActiveBattle()
  // «Cambiar día» en el sitio (como el móvil): el bloque enseña otro día del programa.
  const [chosenDay, setChosenDay] = useState<HomeDayRef | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { state, today, workoutFor, phase } = home
  const locale = i18n.language
  const kind = state.kind

  const primary = (fn: () => void) => () => {
    trackHomePrimaryCta({ state: kind })
    fn()
  }
  const secondary = (target: HomeSecondaryTarget, fn: () => void) => () => {
    trackHomeSecondaryTap({ target, state: kind })
    fn()
  }
  const dayRefs = useMemo((): HomeDayRef[] => {
    if (!activeProgram) return []
    const trainable = WEEK_ORDER
      .map(id => weekDays.find(d => d.id === id))
      .filter((d): d is WeekDay => isTrainableDay(d))
    return trainable
      .filter(d => dayHasContent(d, workoutFor(d.id)))
      .map((d): HomeDayRef => ({
        dayId: d.id,
        date: today,
        workoutKey: `p${phase}_${d.id}`,
        dayType: homeDayType(d.type),
        index: trainable.findIndex(x => x.id === d.id) + 1,
        of: trainable.length,
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `workoutFor` se recrea cada render; lo que cambia es el programa/fase
  }, [activeProgram, weekDays, phase, today])
  const canChangeDay = dayRefs.length > 1

  // Una sesión en curso manda: al volver, el bloque enseña hoy.
  const inProgress = state.kind === 'in_progress'
  useEffect(() => {
    if (inProgress) setChosenDay(null)
  }, [inProgress])

  const changeDay = () => {
    trackHomeChangeDay()
    if (canChangeDay) setPickerOpen(true)
    else navigate('/workout')
  }
  const chooseDay = (day: HomeDayRef) => {
    setPickerOpen(false)
    const isTodaysOwn = state.kind === 'training_day' && day.dayId === state.day.dayId
    setChosenDay(isTodaysOwn ? null : day)
  }

  /** Arranca el día del programa: fuerza/yoga directo a la sesión, el resto por su pantalla. */
  const startDay = (day: HomeDayRef) => {
    const weekDay = weekDays.find(d => d.id === day.dayId)
    if (day.dayType === 'cardio' && weekDay?.cardioConfig) {
      const cfg = weekDay.cardioConfig
      const params = new URLSearchParams()
      params.set('activity', cfg.activityType || 'running')
      if (activeProgram?.id) params.set('program', activeProgram.id)
      params.set('dayKey', day.workoutKey)
      if (cfg.targetDistanceKm) params.set('targetKm', String(cfg.targetDistanceKm))
      if (cfg.targetDurationMin) params.set('targetMin', String(cfg.targetDurationMin))
      navigate(`/cardio?${params.toString()}`)
      return
    }
    if (day.dayType === 'circuit' && weekDay?.circuitConfig?.exercises?.length) {
      circuit.startCircuit(weekDay.circuitConfig, 'program', activeProgram?.id, day.workoutKey)
      navigate('/circuit/active')
      return
    }
    const workout = workoutFor(day.dayId)
    if (workout?.exercises?.length) {
      strength.startSession(workout, day.workoutKey, 'program')
      navigate('/session')
      return
    }
    navigate(`/workout?day=${day.dayId}`)
  }

  const dayLabel = (day: HomeDayRef) => {
    const weekday = weekdayOf(day.date, locale)
    return day.date === shiftDay(today, 1)
      ? t('home.next.tomorrow', { day: weekday })
      : t('home.next.label', { day: weekday })
  }

  const dayMeta = (day: HomeDayRef): string | null => {
    const workout = workoutFor(day.dayId)
    const count = workout?.exercises?.length ?? 0
    if (!count) return null
    return t('home.training.meta', {
      minutes: calculateWorkoutDuration(workout!.exercises),
      exercises: t('workout.exerciseCount', { count }),
    })
  }

  const programLine = activeProgram && programProgress.totalWeeks > 0 ? (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3">
        <Meta className="truncate text-[10px]">
          {t('home.training.programPhase', { program: activeProgram.name, phase: programProgress.currentPhase, phases: phases.length || 1 })}
        </Meta>
        <Meta className="shrink-0 text-[10px]">
          {t('home.training.programWeek', { week: programProgress.currentWeek ?? 1, weeks: programProgress.totalWeeks })}
        </Meta>
      </div>
      <div className="h-1 rounded-full bg-muted">
        <div className="h-1 rounded-full bg-foreground" style={{ width: `${Math.max(2, programProgress.percent)}%` }} />
      </div>
    </div>
  ) : null

  const inactive = state.modifiers.inactiveDays != null ? (
    <p className="m-0 text-[13px] font-medium text-foreground" data-testid="home-inactive">
      {t('home.inactive', { count: state.modifiers.inactiveDays })}
    </p>
  ) : null

  /** Tarjeta «Siguiente» / «Mañana» con el día que toca después. */
  const nextCard = (next: HomeDayRef | null, target: HomeSecondaryTarget, withButton: boolean) => {
    if (!next) return null
    const meta = dayMeta(next)
    const tomorrowRest = next.date > shiftDay(today, 1) && kind === 'done_today'
    const open = secondary(target, () => setChosenDay(next))
    if (withButton) {
      return (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex flex-col gap-1">
            <Meta className="text-[10px]">{dayLabel(next)}</Meta>
            <span className="text-base font-medium">{focusOfDay(t, weekDays, next.dayId)}</span>
            {meta && <Meta className="text-[10px]">{meta}</Meta>}
          </div>
          <Button variant="outline" onClick={open} className="h-11 rounded-[10px] text-[13px]">{t('home.action.viewWorkout')}</Button>
        </div>
      )
    }
    return (
      <button
        type="button"
        onClick={open}
        className="flex min-h-14 items-center gap-3 rounded-lg border border-border p-4 text-left hover:bg-muted/40"
      >
        <span className="flex flex-1 flex-col gap-1">
          <Meta className="text-[10px]">{dayLabel(next)}</Meta>
          <span className="text-base font-medium">{focusOfDay(t, weekDays, next.dayId)}</span>
          <Meta className="text-[10px]">
            {[meta, tomorrowRest ? t('home.next.tomorrowRest') : null].filter(Boolean).join(' · ')}
          </Meta>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    )
  }

  const activate = async (program: ProgramMeta) => {
    const ok = await selectProgram(program.id)
    if (ok) toast.success(t('programs.switchSuccess', { defaultValue: 'Programa cambiado correctamente' }))
    else toast.error(t('programs.switchError', { defaultValue: 'Error al cambiar de programa. Intenta de nuevo.' }))
  }

  /** Bloque de un día del programa: el de hoy, o el elegido con «Cambiar día». */
  const trainingBlock = (day: HomeDayRef, deload: boolean, chosen: boolean) => {
    const workout = workoutFor(day.dayId)
    const weekDay = weekDays.find(d => d.id === day.dayId)
    const kickerKey = day.dayType === 'cardio'
      ? 'home.kicker.todayCardio'
      : day.dayType === 'circuit'
        ? 'home.kicker.todayCircuit'
        : day.dayType === 'yoga' ? 'home.kicker.todayYoga' : 'home.kicker.today'
    const startLabel = day.dayType === 'cardio'
      ? t('home.action.startCardio')
      : day.dayType === 'circuit'
        ? t('home.action.startCircuit')
        : day.dayType === 'yoga' ? t('home.action.startYoga') : t('home.action.start')
    const cardioCfg = day.dayType === 'cardio' ? weekDay?.cardioConfig : undefined
    const circuitCfg = day.dayType === 'circuit' ? weekDay?.circuitConfig : undefined
    const title = cardioCfg
      ? focusOfDay(t, weekDays, day.dayId) || t(`cardio.${cardioCfg.activityType || 'running'}`)
      : circuitCfg
        ? localize(circuitCfg.name, locale)
        : workout?.title || focusOfDay(t, weekDays, day.dayId)
    const nextPhase = programProgress.currentPhase < phases.length ? programProgress.currentPhase + 1 : null
    return (
      <Shell label={t('home.a11y.today')} accent testState={chosen ? 'chosen_day' : 'training_day'}>
        <div className="-my-2.5 flex items-center justify-between">
          <Kicker>
            {chosen
              ? t('home.kicker.chosenDay', { day: t(`day.inSentence.${day.dayId}`) })
              : t(kickerKey, { index: day.index, total: day.of })}
          </Kicker>
          {chosen ? (
            <TextAction onClick={() => setChosenDay(null)} className="pl-3">{t('home.action.backToToday')}</TextAction>
          ) : canChangeDay ? (
            <TextAction onClick={changeDay} className="pl-3">{t('home.action.changeDay')}</TextAction>
          ) : null}
        </div>
        {!chosen && inactive}
        {deload && (
          <span className="self-start rounded-md border border-lime/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-lime-text">
            {t('home.deload.banner')}
          </span>
        )}
        <div className="flex flex-col gap-1.5 lg:gap-2">
          <Title>{title}</Title>
          {cardioCfg
            ? activeProgram && <Meta>{activeProgram.name}</Meta>
            : circuitCfg
              ? <Meta>{t('circuit.summary', { rounds: circuitCfg.rounds, exercises: circuitCfg.exercises.length })}</Meta>
              : dayMeta(day) && <Meta>{dayMeta(day)}</Meta>}
        </div>
        {cardioCfg ? (
          <>
            <Stats items={[
              { value: cardioCfg.targetDistanceKm ? `${cardioCfg.targetDistanceKm} km` : '—', label: t('home.cardio.target') },
              { value: cardioCfg.targetDurationMin ? `${cardioCfg.targetDurationMin} min` : '—', label: t('home.cardio.duration') },
              { value: 'Z2', label: t('home.cardio.easyPace') },
            ]} />
            {cardioCfg.targetDistanceKm ? (
              <p className="m-0 text-sm text-muted-foreground">{t('home.cardio.gpsHint', { km: cardioCfg.targetDistanceKm })}</p>
            ) : null}
          </>
        ) : circuitCfg ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {circuitCfg.exercises.slice(0, 3).map((ex, i) => (
              <li key={`${ex.exerciseId}-${i}`} className="flex h-8 items-center justify-between gap-3 border-t border-border text-sm last:border-b">
                <span className="truncate">{localize(ex.name, locale)}</span>
                <Meta className="shrink-0">{ex.workSecondsOverride ? `${ex.workSecondsOverride} s` : ex.reps ?? ''}</Meta>
              </li>
            ))}
          </ul>
        ) : (
          <ExerciseList workout={workout} />
        )}
        {deload && (
          <p className="m-0 text-sm text-muted-foreground">
            {nextPhase
              ? t('home.deload.body', { phase: programProgress.currentPhase, next: nextPhase })
              : t('home.deload.bodyLastPhase', { phase: programProgress.currentPhase })}
          </p>
        )}
        <div className="flex flex-col gap-3.5">
          {programLine}
          <PrimaryAction onClick={primary(() => startDay(day))}>{startLabel}</PrimaryAction>
          {/* Solo si el día se puede jugar como batalla (#882): fuerza con ejercicios. */}
          {day.dayType === 'strength' && battleDay.convert(day.dayId, { phase })?.ok ? (
            <TextAction
              onClick={() => navigate(`/battle-create?origin=program_day&phase=${phase}&day=${day.dayId}`)}
              className="self-center"
            >
              {t('battle.challengeFriend')}
            </TextAction>
          ) : null}
        </div>
      </Shell>
    )
  }

  if (state.modifiers.loading) {
    return (
      <div
        data-testid="home-today-skeleton"
        aria-busy="true"
        className="h-[380px] rounded-xl border border-border bg-card motion-safe:animate-pulse lg:h-[460px]"
      />
    )
  }

  const picker = (
    <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
      <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-xl">
        <SheetHeader>
          <SheetTitle>{t('home.changeDay.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('home.changeDay.title')}</SheetDescription>
        </SheetHeader>
        <ul className="m-0 mt-2 flex list-none flex-col p-0" data-testid="home-day-picker">
          {dayRefs
            .filter(d => d.dayId !== chosenDay?.dayId)
            .map(d => {
              const title = d.dayType === 'cardio' ? t('cardio.title') : workoutFor(d.dayId)?.title || focusOfDay(t, weekDays, d.dayId)
              return (
                <li key={d.dayId}>
                  <button
                    type="button"
                    onClick={() => chooseDay(d)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border py-2 text-left text-sm hover:bg-muted/40"
                  >
                    <span className="font-medium">{t(`day.${d.dayId}`)}</span>
                    <span className="truncate text-muted-foreground">{title}</span>
                  </button>
                </li>
              )
            })}
        </ul>
      </SheetContent>
    </Sheet>
  )

  if (chosenDay && state.kind !== 'in_progress') {
    return <>{trainingBlock(chosenDay, false, true)}{picker}</>
  }

  switch (state.kind) {
    // ── En curso ────────────────────────────────────────────────────────────
    case 'in_progress': {
      const { activity, fromAnotherDay } = state
      let title = ''
      let detail: string | null = null
      let continueLabel = t('home.action.continue')
      let target = '/session'
      let startedAt: number | null = null
      let setsDone = 0
      if (activity.type === 'battle') {
        title = t('battle.kicker')
        continueLabel = t('home.inProgress.continueBattle')
        target = activeBattle ? `/battle/${activeBattle.id}` : '/community?tab=battles'
      } else if (activity.type === 'cardio') {
        title = t(`cardio.${cardio.activityType || 'running'}`)
        detail = `${cardio.distance.toFixed(2)} km · ${Math.floor(cardio.duration / 60)} min`
        continueLabel = t('home.inProgress.continueCardio')
        target = '/cardio'
        startedAt = Date.now() - cardio.duration * 1000
      } else if (activity.type === 'circuit') {
        title = circuit.circuit ? localize(circuit.circuit.name, locale) : ''
        continueLabel = t('home.inProgress.continueCircuit')
        target = '/circuit/active'
        startedAt = circuit.startedAt
      } else {
        title = strength.workout?.title ?? ''
        const snapshot = strength.getProgressSnapshot()
        setsDone = snapshot.setsCount
        const exercises = strength.workout?.exercises?.length ?? 0
        if (exercises) {
          detail = t('home.inProgress.exercise', { current: Math.min(exercises, snapshot.stepIdx + 1), total: exercises })
        }
        if (activity.type === 'free') continueLabel = t('home.inProgress.continueFree')
        startedAt = strength.startedAt
      }
      const minutes = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 60000)) : 0
      const kicker = fromAnotherDay && activity.startedDay
        ? t('home.kicker.inProgressOtherDay', { day: weekdayOf(activity.startedDay, locale) })
        : t('home.kicker.inProgress', { minutes })
      const discard = () => {
        setDiscardOpen(false)
        if (activity.type === 'cardio') cardio.discard()
        else if (activity.type === 'circuit') circuit.abandonCircuit()
        else strength.endSession()
      }
      return (
        <Shell label={t('home.a11y.inProgress')} accent testState="in_progress">
          <Kicker>{kicker}</Kicker>
          <div className="flex flex-col gap-1.5">
            <Title>{title}</Title>
            {detail && <Meta>{detail}</Meta>}
          </div>
          {activity.type !== 'cardio' && activity.type !== 'circuit' && activity.type !== 'battle' && <ExerciseList workout={strength.workout} compactOnly />}
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-6">
            <PrimaryAction onClick={primary(() => navigate(target))}>{continueLabel}</PrimaryAction>
            {activity.type !== 'battle' && (
              <TextAction onClick={() => setDiscardOpen(true)} className="self-center">{t('home.action.discard')}</TextAction>
            )}
          </div>
          <DiscardSessionDialog open={discardOpen} onOpenChange={setDiscardOpen} setsCount={setsDone} onConfirm={discard} />
        </Shell>
      )
    }

    // ── Programa terminado ──────────────────────────────────────────────────
    case 'program_complete': {
      const next = pickRecommended(programs, activeProgram?.id, user?.level)[0] ?? null
      return (
        <Shell label={t('home.kicker.programComplete')} accent testState="program_complete">
          <Kicker>{t('home.kicker.programComplete')}</Kicker>
          <Title>{t('home.programComplete.title', { name: activeProgram?.name ?? '' })}</Title>
          <Stats items={[
            { value: programProgress.totalWeeks || activeProgram?.duration_weeks || 0, label: t('home.programComplete.weeks') },
            { value: getTotalSessions(), label: t('home.programComplete.workouts') },
            { value: phases.length || 1, label: t('home.table.phases') },
          ]} />
          {next && (
            <div className="flex flex-col gap-1">
              <Meta className="text-[10px]">{t('home.programComplete.nextRecommended')}</Meta>
              <span className="text-base font-medium">{next.name}</span>
              <Meta className="text-[10px]">{programMeta(t, next)}</Meta>
            </div>
          )}
          <PrimaryAction onClick={primary(() => (next ? activate(next) : navigate('/programs')))}>
            {next ? t('home.action.startProgram', { name: next.name }) : t('home.action.seeOthers')}
          </PrimaryAction>
          <div className="flex gap-2">
            {next && <SecondaryAction onClick={secondary('other_program', () => navigate('/programs'))}>{t('home.action.seeOthers')}</SecondaryAction>}
            <SecondaryAction onClick={secondary('summary', () => navigate('/progress'))}>{t('home.programComplete.summary')}</SecondaryAction>
          </div>
        </Shell>
      )
    }

    // ── Sin programa ────────────────────────────────────────────────────────
    case 'no_program': {
      const options = pickRecommended(programs, null, user?.level).slice(0, 3)
      const first = options[0] ?? null
      return (
        <Shell label={t('home.noProgram.title')} accent testState="no_program">
          <Kicker>{t('home.kicker.noProgram')}</Kicker>
          <div className="flex flex-col gap-1.5">
            <Title>{t('home.noProgram.title')}</Title>
            {options.length > 0 && <p className="m-0 text-sm text-muted-foreground">{t('home.noProgram.body')}</p>}
          </div>
          {options.length > 0 && (
            <ul className="m-0 flex list-none flex-col p-0">
              {options.map((p, i) => (
                <li key={p.id} className={cn('flex min-h-12 items-center justify-between gap-3 border-t border-border py-2', i === options.length - 1 && 'border-b')}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <Meta className="text-[10px]">{programMeta(t, p)}</Meta>
                  </span>
                  {i === 0 && <span className="shrink-0 rounded-md border border-lime/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-lime-text">{t('home.noProgram.recommended')}</span>}
                </li>
              ))}
            </ul>
          )}
          <PrimaryAction onClick={primary(() => (first ? activate(first) : navigate('/programs')))} icon={!!first}>
            {first ? t('home.action.startProgram', { name: first.name }) : t('home.action.seeAllPrograms', { count: programs.length })}
          </PrimaryAction>
          {first && (
            <TextAction onClick={secondary('other_program', () => navigate('/programs'))} className="self-center">
              {t('home.action.seeAllPrograms', { count: programs.length })}
            </TextAction>
          )}
          <button
            type="button"
            onClick={() => navigate('/free-session')}
            className="flex min-h-14 items-center gap-3 border-t border-border pt-3 text-left"
          >
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{t('home.noProgram.freeTitle')}</span>
              <span className="text-xs text-muted-foreground">{t('home.noProgram.freeBody')}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </Shell>
      )
    }

    // ── Día 0 ───────────────────────────────────────────────────────────────
    case 'first_workout': {
      const level = normalizeFirstWorkoutLevel(user?.level)
      const minutes = estimateFirstWorkoutMinutes(level)
      const workout = buildFirstWorkout(level, locale)
      const firstDay = weekDays.find(d => d.type !== 'rest')
      return (
        <Shell label={t('home.firstWorkout.title')} accent testState="first_workout">
          <Kicker>{t('home.kicker.firstWorkout')}</Kicker>
          <div className="flex flex-col gap-1.5">
            <Title>{t('home.firstWorkout.title')}</Title>
            <Meta>
              {t('home.training.meta', { minutes, exercises: t('workout.exerciseCount', { count: workout.exercises.length }) })}
              {' · '}{t('home.firstWorkout.noEquipment')}
            </Meta>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {workout.exercises.map((ex, i) => (
              <li key={ex.id} className={cn('flex h-8 items-center justify-between gap-3 border-t border-border text-sm', i === workout.exercises.length - 1 && 'border-b')}>
                <span className="truncate">{ex.name}</span>
                <Meta className="shrink-0">{setsReps(ex)}</Meta>
              </li>
            ))}
          </ul>
          <p className="m-0 text-sm text-muted-foreground">{t('home.firstWorkout.body')}</p>
          <PrimaryAction
            onClick={primary(() => {
              if (userId) markFirstWorkoutPending(userId, user?.level, 'home')
              navigate('/session')
            })}
          >
            {t('home.action.startMinutes', { minutes })}
          </PrimaryAction>
          {activeProgram && firstDay && (
            <button
              type="button"
              onClick={secondary('other_program', () => navigate(`/workout?day=${firstDay.id}`))}
              className="flex min-h-11 flex-col items-start justify-center text-left text-[13px]"
            >
              <span className="text-muted-foreground">{t('home.firstWorkout.preferProgram')}</span>
              <span className="font-medium underline underline-offset-[3px]">
                {t('home.firstWorkout.programDay', { program: activeProgram.name, day: 1 })}
              </span>
            </button>
          )}
        </Shell>
      )
    }

    // ── Vuelta tras un parón ────────────────────────────────────────────────
    case 'comeback': {
      const { day, daysSinceLast } = state
      const workout = day ? workoutFor(day.dayId) : null
      const isMonday = new Date(`${today}T12:00:00`).getDay() === 1
      return (
        <>
        <Shell label={t('home.kicker.comeback')} accent testState="comeback">
          <Kicker>{isMonday ? t('home.kicker.comebackNewWeek') : t('home.kicker.comeback')}</Kicker>
          <div className="flex flex-col gap-1.5">
            <Title>{t('home.comeback.title')}</Title>
            <p className="m-0 text-sm text-muted-foreground">{t('home.comeback.body', { count: daysSinceLast })}</p>
          </div>
          {day && (
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <Meta className="text-[10px]">{day.date === today ? weekdayOf(day.date, locale) : dayLabel(day)}</Meta>
              <span className="font-bebas text-[28px] leading-none">{workout?.title || focusOfDay(t, weekDays, day.dayId)}</span>
              {dayMeta(day) && <Meta className="text-[10px]">{dayMeta(day)}</Meta>}
            </div>
          )}
          <ExerciseList workout={workout} compactOnly />
          <PrimaryAction onClick={primary(() => (day ? startDay(day) : navigate('/workout')))}>
            {t('home.action.startShort')}
          </PrimaryAction>
          <TextAction onClick={changeDay} className="self-center">{t('home.action.chooseOtherDay')}</TextAction>
        </Shell>
        {picker}
        </>
      )
    }

    // ── Hecho hoy ───────────────────────────────────────────────────────────
    case 'done_today': {
      const { day, next, variant } = state
      const workout = workoutFor(day.dayId)
      const title = workout?.title || focusOfDay(t, weekDays, day.dayId)
      const todaysCardio = variant === 'cardio' && cardioLastSession
        && utcToLocalDateStr(cardioLastSession.started_at.replace(' ', 'T')) === today
        ? cardioLastSession
        : null
      const entry = progress?.[`done_${today}_${day.workoutKey}`] as SessionDone | undefined
      const doneMinutes = entry?.durationSeconds ? Math.round(entry.durationSeconds / 60) : null
      const strengthStats = variant === 'cardio' ? [] : [
        ...(doneMinutes ? [{ value: doneMinutes, label: t('home.done.minutes') }] : []),
        ...(workout?.exercises?.length ? [{ value: plannedSetCount(workout.exercises), label: t('home.done.sets') }] : []),
      ]
      const summaryPath = todaysCardio?.id ? `/cardio/session/${todaysCardio.id}` : `/session/${today}/${day.workoutKey}`
      return (
        <Shell label={t('home.a11y.done')} accent={false} testState="done_today">
          <Kicker>{t('home.kicker.doneToday')}</Kicker>
          <Title>{title}</Title>
          {todaysCardio ? (
            <StatGrid items={[
              { value: todaysCardio.distance_km.toFixed(1), label: t('home.cardio.distance') },
              { value: Math.round(todaysCardio.duration_seconds / 60), label: t('home.cardio.minutes') },
              { value: todaysCardio.avg_pace ? formatPace(todaysCardio.avg_pace) : '—', label: t('home.cardio.pace') },
            ]} />
          ) : strengthStats.length > 0 ? (
            <StatGrid items={strengthStats} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <SecondaryAction onClick={secondary('summary', () => navigate(summaryPath))}>{t('home.action.viewSummary')}</SecondaryAction>
            <SecondaryAction
              onClick={secondary('share', () => {
                const name = user?.display_name || user?.name || ''
                void shareWorkoutSession(name, title, today, day.workoutKey)
              })}
            >
              {t('home.action.share')}
            </SecondaryAction>
          </div>
          {variant !== 'cardio' && (
            <TextAction onClick={secondary('repeat', () => startDay(day))} className="self-start">
              {t('home.action.repeat')}
            </TextAction>
          )}
          {nextCard(next, 'next_day', false)}
        </Shell>
      )
    }

    // ── Semana completada ───────────────────────────────────────────────────
    case 'week_complete': {
      const week = programProgress.currentWeek
      return (
        <>
          <Shell label={t('home.a11y.weekComplete')} accent={false} testState="week_complete">
            <Kicker>
              {week
                ? t('home.kicker.weekComplete', { week, done: home.week.done, goal: home.goal })
                : t('home.kicker.weekCompleteNoNumber', { done: home.week.done, goal: home.goal })}
            </Kicker>
            <div className="flex flex-col gap-1.5">
              <Title>{t('home.weekComplete.title')}</Title>
              <p className="m-0 text-sm text-muted-foreground">{t('home.weekComplete.body', { count: Math.max(1, home.streak.current) })}</p>
            </div>
            {nextCard(state.next, 'next_day', false)}
            <SecondaryAction
              onClick={secondary('share', () => {
                void shareContent({
                  title: t('home.weekComplete.title'),
                  text: t('home.weekComplete.shareText', { done: home.week.done, goal: home.goal }),
                  url: window.location.origin,
                })
              })}
            >
              {t('home.action.shareWeek')}
            </SecondaryAction>
          </Shell>
          <MoveOptional />
        </>
      )
    }

    // ── Descanso ────────────────────────────────────────────────────────────
    case 'rest_day': {
      const { next, comingSoon } = state
      const nextWhen = next
        ? (next.date === shiftDay(today, 1) ? t('home.rest.tomorrow') : weekdayOf(next.date, locale))
        : null
      return (
        <>
          <Shell label={t('home.a11y.rest')} accent={false} testState="rest_day">
            <Kicker>{t('home.kicker.rest')}</Kicker>
            {inactive}
            <div className="flex flex-col gap-1.5">
              <Title>{t('home.rest.title')}</Title>
              <p className="m-0 text-sm text-muted-foreground">
                {comingSoon
                  ? t('home.rest.comingSoon')
                  : next
                    ? t('home.rest.bodyNext', { day: nextWhen, focus: focusOfDay(t, weekDays, next.dayId).toLowerCase() })
                    : t('home.rest.body')}
              </p>
            </div>
            {nextCard(next, 'next_day', true)}
          </Shell>
          <MoveOptional />
        </>
      )
    }

    // ── Toca entrenar (Main / Cardio / Descarga) ────────────────────────────
    case 'training_day':
      return <>{trainingBlock(state.day, state.deload, false)}{picker}</>
  }

}

/** «Si te apetece moverte»: movilidad y cardio suave, debajo del descanso. */
function MoveOptional() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const rows = [
    { to: '/lumbar', icon: <StretchHorizontal className="size-4" aria-hidden="true" />, title: t('home.rest.mobility'), hint: t('home.rest.mobilityHint', { minutes: 10 }) },
    { to: '/cardio', icon: <Footprints className="size-4" aria-hidden="true" />, title: t('home.rest.easyCardio'), hint: t('home.rest.easyCardioHint') },
  ]
  return (
    <section aria-label={t('home.rest.moveOptional')} className="flex flex-col gap-2">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t('home.rest.moveOptional')}</h2>
      <div className="border-t border-border">
        {rows.map(row => (
          <button
            key={row.to}
            type="button"
            onClick={() => navigate(row.to)}
            className="flex min-h-14 w-full items-center gap-3 border-b border-border text-left"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border">{row.icon}</span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{row.title}</span>
              <span className="text-xs text-muted-foreground">{row.hint}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  )
}

function programMeta(t: (k: string, o?: Record<string, unknown>) => string, p: ProgramMeta): string {
  const weeks = p.duration_weeks || 0
  const days = p.days_per_week || 0
  return weeks && days ? t('home.noProgram.weeksDays', { weeks, days }) : weeks ? t('home.training.programWeek', { week: weeks, weeks }) : ''
}

const LEVEL_DIFFICULTY: Record<string, string[]> = {
  principiante: ['beginner', 'principiante'],
  intermedio: ['intermediate', 'intermedio'],
  avanzado: ['advanced', 'avanzado'],
}

/**
 * Programas que recomendar: primero los de tu nivel, luego el resto, sin el
 * programa que acabas de terminar. Solo oficiales o tuyos (ya vienen así de
 * `programs`).
 */
function pickRecommended(programs: readonly ProgramMeta[] | null | undefined, excludeId: string | null | undefined, level: string | null | undefined): ProgramMeta[] {
  const list = (programs ?? []).filter(p => p.id !== excludeId)
  const wanted = LEVEL_DIFFICULTY[normalizeFirstWorkoutLevel(level)] ?? []
  const matches = list.filter(p => p.difficulty && wanted.includes(String(p.difficulty).toLowerCase()))
  return [...matches, ...list.filter(p => !matches.includes(p))]
}

