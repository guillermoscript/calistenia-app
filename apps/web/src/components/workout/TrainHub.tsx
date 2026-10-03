import type React from 'react'
import { Link } from 'react-router-dom'
import { Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WEEK_DAYS as FALLBACK_WEEK_DAYS, PHASES as FALLBACK_PHASES, getWorkout as fallbackGetWorkout } from '@calistenia/core/data/workouts'
import { DAY_BY_INDEX } from '@calistenia/core/lib/training-day'
import { localDay } from '@calistenia/core/lib/dateUtils'
import { calculateWorkoutDuration } from '@calistenia/core/lib/duration'
import { useWorkoutState, useWorkoutActions } from '../../contexts/WorkoutContext'
import { useTrainingWeek } from '../../hooks/useTrainingWeek'
import { useBattleProgramDay } from '../../hooks/useBattleProgramDay'
import { battleChallengeHref } from '../../lib/battle-create'
import { useProgramSwitcher } from '../program/ProgramSwitcher'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import {
  type IconProps,
  FreeSessionIcon, RunningIcon, CircuitIcon, SpineIcon, PencilIcon, CheckIcon,
} from '../icons/nav-icons'

const KICKER = 'text-[10px] font-mono tracking-[2px] uppercase text-muted-foreground'

function ChevronRight() {
  return (
    <svg className="size-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <polyline points="6,3 11,8 6,13" />
    </svg>
  )
}

interface WayToTrain {
  to: string
  icon: React.FC<IconProps>
  titleKey: string
  descKey: string
}

const OTHER_WAYS: WayToTrain[] = [
  { to: '/free-session', icon: FreeSessionIcon, titleKey: 'train.freeSession', descKey: 'train.freeSessionDesc' },
  { to: '/cardio', icon: RunningIcon, titleKey: 'train.cardio', descKey: 'train.cardioDesc' },
  { to: '/circuit', icon: CircuitIcon, titleKey: 'train.circuit', descKey: 'train.circuitDesc' },
  { to: '/lumbar', icon: SpineIcon, titleKey: 'train.lumbar', descKey: 'train.lumbarDesc' },
  { to: '/log-workout', icon: PencilIcon, titleKey: 'train.logOutside', descKey: 'train.logOutsideDesc' },
]

/**
 * Pestaña Entrenar (`/workout` sin `?day`, #856): el programa y su fase, la
 * semana, otras formas de entrenar y explorar. Cada día entrenable lleva a
 * `/workout?day=X`, que es la vista del día de siempre.
 */
export default function TrainHub() {
  const { t } = useTranslation()
  const { activeProgram, phases, weekDays, programProgress } = useWorkoutState()
  const { isWorkoutDone, getWorkout: getWorkoutAction } = useWorkoutActions()
  const { streak } = useTrainingWeek()
  const { openSwitcher, switcherModal } = useProgramSwitcher()
  const battleDay = useBattleProgramDay()

  const PHASES = phases || FALLBACK_PHASES
  const WEEK_DAYS = weekDays || FALLBACK_WEEK_DAYS
  const getWorkout = getWorkoutAction || fallbackGetWorkout
  const phaseId = programProgress.currentPhase || 1
  const phase = PHASES.find(p => p.id === phaseId)
  const todayId = DAY_BY_INDEX[localDay()]
  const { currentWeek, totalWeeks, percent } = programProgress

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8 flex flex-col gap-8">
      {/* Programa, fase y semana: lo que había en la «Configuración» del inicio. */}
      <header className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className={KICKER}>{t('train.yourProgram')}</div>
            <h1 className="font-bebas text-[34px] md:text-[44px] leading-none truncate">
              {activeProgram ? activeProgram.name : t('train.noProgram')}
            </h1>
          </div>
          {activeProgram ? (
            <Button variant="outline" className="h-11 shrink-0" onClick={openSwitcher}>{t('train.change')}</Button>
          ) : (
            <Button asChild className="h-11 shrink-0"><Link to="/programs">{t('train.chooseProgram')}</Link></Button>
          )}
        </div>
        {activeProgram ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-3 text-[11px] font-mono tracking-wide uppercase text-muted-foreground">
              <span className="truncate">
                {t('train.phaseOf', { phase: phaseId, total: PHASES.length })}
                {phase ? ` · ${phase.nameKey ? t(phase.nameKey) : phase.name}` : ''}
              </span>
              {currentWeek && totalWeeks > 0 ? (
                <span className="shrink-0">{t('train.weekOf', { week: currentWeek, total: totalWeeks })}</span>
              ) : null}
            </div>
            <div
              className="h-1 rounded-full bg-muted overflow-hidden"
              role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
              aria-label={t('train.programProgress')}
            >
              <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('train.noProgramDesc')}</p>
        )}
      </header>

      {/* Esta semana */}
      <section aria-labelledby="train-week" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 id="train-week" className={KICKER}>{t('train.thisWeek')}</h2>
          <span className={KICKER}>{t('train.weekDone', { done: streak.thisWeek.done, goal: streak.thisWeek.goal })}</span>
        </div>
        <ol className="border-t border-border">
          {WEEK_DAYS.map(day => {
            const dayName = ((day.nameKey ? t(day.nameKey) : day.name) ?? '').slice(0, 3)
            const focus = day.focusKey ? t(day.focusKey) : day.focus
            const isToday = day.id === todayId
            if (day.type === 'rest') {
              return (
                <li key={day.id} className="flex items-center gap-3 h-12 border-b border-border text-sm text-muted-foreground/70">
                  <span className="w-9 font-mono text-[10px] tracking-wider uppercase">{dayName}</span>
                  <span className="flex-1">{t('train.rest')}</span>
                  {isToday ? <span className="font-mono text-[10px] tracking-wider uppercase">{t('common.today')}</span> : null}
                </li>
              )
            }
            const workout = getWorkout(phaseId, day.id)
            const minutes = workout ? calculateWorkoutDuration(workout.exercises) : 0
            const done = isWorkoutDone(`p${phaseId}_${day.id}`)
            // «Retar» (#882): solo en días de fuerza que se pueden jugar como batalla.
            const challengeable = !!battleDay.convert(day.id, { phase: phaseId })?.ok
            return (
              <li key={day.id} className="flex items-center">
                <Link
                  to={`/workout?day=${day.id}`}
                  aria-current={isToday ? 'date' : undefined}
                  className={cn(
                    'flex flex-1 min-w-0 items-center gap-3 min-h-12 py-2 border-b border-border text-sm transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-md',
                    isToday ? 'font-medium text-foreground' : done ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  <span className={cn('w-9 font-mono text-[10px] tracking-wider uppercase', isToday ? 'text-lime' : 'text-muted-foreground')}>{dayName}</span>
                  <span className="flex-1 min-w-0 truncate">{workout?.title || focus}</span>
                  {done ? (
                    <CheckIcon className="size-4 text-lime shrink-0" />
                  ) : (
                    <span className={cn('font-mono text-[10px] tracking-wider uppercase shrink-0', isToday ? 'text-lime' : 'text-muted-foreground')}>
                      {isToday ? t('common.today') : ''}
                      {isToday && minutes > 0 ? ' · ' : ''}
                      {minutes > 0 ? `${minutes} min` : ''}
                    </span>
                  )}
                  {done ? <span className="sr-only">{t('dashboard.completed')}</span> : null}
                </Link>
                {challengeable ? (
                  <Link
                    to={battleChallengeHref(phaseId, day.id)}
                    aria-label={`${t('battle.challengeFriend')}: ${dayName}`}
                    title={t('battle.challengeFriend')}
                    className="ml-1 size-11 shrink-0 flex items-center justify-center rounded-full border-b border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  >
                    <Swords className="size-4" aria-hidden />
                  </Link>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>

      {/* Otras formas de entrenar */}
      <section aria-labelledby="train-other" className="flex flex-col gap-2">
        <h2 id="train-other" className={KICKER}>{t('train.otherWays')}</h2>
        <ul className="border-t border-border">
          {OTHER_WAYS.map(({ to, icon: Icon, titleKey, descKey }) => (
            <li key={to}>
              <Link to={to} className="flex items-center gap-3 min-h-14 py-2 border-b border-border hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors">
                <span className="size-8 rounded-lg border border-border flex items-center justify-center shrink-0">
                  <Icon className="size-4 text-lime" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{t(titleKey)}</span>
                  <span className="block text-xs text-muted-foreground">{t(descKey)}</span>
                </span>
                <ChevronRight />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Explorar */}
      <section aria-labelledby="train-explore" className="flex flex-col gap-2">
        <h2 id="train-explore" className={KICKER}>{t('train.explore')}</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <Link to="/programs" className="rounded-xl border border-border p-3.5 flex flex-col gap-1 hover:border-foreground/30 transition-colors">
            <span className="font-bebas text-2xl leading-none">{t('nav.programs')}</span>
            <span className="text-xs text-muted-foreground">{t('train.programsDesc')}</span>
          </Link>
          <Link to="/exercises" className="rounded-xl border border-border p-3.5 flex flex-col gap-1 hover:border-foreground/30 transition-colors">
            <span className="font-bebas text-2xl leading-none">{t('nav.exercises')}</span>
            <span className="text-xs text-muted-foreground">{t('train.exercisesDesc')}</span>
          </Link>
        </div>
      </section>

      {switcherModal}
    </div>
  )
}
