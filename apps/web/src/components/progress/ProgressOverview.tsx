import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCardioStats } from '@calistenia/core/hooks/useCardioStats'
import { useSleep } from '@calistenia/core/hooks/useSleep'
import { useBodyPhotos } from '@calistenia/core/hooks/useBodyPhotos'
import { safeLocale } from '@calistenia/core/lib/i18n-safe'
import type { WeekHistoryEntry } from '@calistenia/core/lib/weeklyStreak'
import { useWorkoutState, useWorkoutActions } from '../../contexts/WorkoutContext'
import { useAuthState } from '../../contexts/AuthContext'
import { useTrainingWeek } from '../../hooks/useTrainingWeek'
import InsightsCard from '../insights/InsightsCard'
import InsightsHistory from '../insights/InsightsHistory'
import CardioWidget from '../cardio/CardioWidget'
import { cn } from '../../lib/utils'

const KICKER = 'text-[10px] font-mono tracking-[2px] uppercase text-muted-foreground'

function Chevron({ down = false, open = false }: { down?: boolean; open?: boolean }) {
  return (
    <svg
      className={cn('size-4 text-muted-foreground shrink-0 transition-transform duration-200', down && open && 'rotate-180')}
      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden
    >
      {down ? <polyline points="4,6 8,10 12,6" /> : <polyline points="6,3 11,8 6,13" />}
    </svg>
  )
}

function weekLabel(entry: WeekHistoryEntry, t: (k: string, o?: Record<string, unknown>) => string): string {
  const state = entry.state === 'met' ? t('progress.streak.met') : entry.state === 'missed' ? t('progress.streak.missed') : t('progress.streak.inProgress')
  return t('progress.streak.weekAria', { date: entry.weekStart, done: entry.done, goal: entry.goal, state })
}

/**
 * Tarjeta de racha semanal (#856): semanas seguidas cumpliendo el objetivo, las
 * últimas 10 semanas y las cifras de entrenos. La racha rota no se enseña como
 * «0 semanas»: se invita a empezarla (regla 5 del lienzo de #852).
 */
export function WeeklyStreakCard() {
  const { t } = useTranslation()
  const { getTotalSessions } = useWorkoutActions()
  const { streak, history, goal } = useTrainingWeek()
  const total = getTotalSessions()

  return (
    <section aria-labelledby="progress-streak" className="rounded-xl border border-border bg-card p-4 md:p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="progress-streak" className={KICKER}>{t('progress.streak.title')}</h2>
        <Link to="/profile?open=weeklyGoal" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground min-h-8 inline-flex items-center">
          {t('progress.streak.goalLink', { count: goal })}
        </Link>
      </div>

      <div className="flex items-end gap-3">
        {streak.current > 0 ? (
          <>
            <span className="font-bebas text-6xl leading-[0.85]">{streak.current}</span>
            <p className="text-sm text-muted-foreground pb-0.5">
              <span className="text-foreground font-medium">{t('progress.streak.weeks', { count: streak.current })}</span>{' '}
              {t('progress.streak.keepingGoal', { done: streak.thisWeek.done, goal: streak.thisWeek.goal })}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="block font-bebas text-3xl text-foreground leading-none mb-1">{t('progress.streak.startTitle')}</span>
            {t('progress.streak.startDesc', { done: streak.thisWeek.done, goal: streak.thisWeek.goal })}
          </p>
        )}
      </div>

      <div>
        <ol className="grid grid-cols-10 gap-1.5" aria-label={t('progress.streak.last10')}>
          {history.map(entry => (
            <li
              key={entry.weekStart}
              title={weekLabel(entry, t)}
              className={cn(
                'h-6 rounded-[4px]',
                entry.state === 'met' && 'bg-lime',
                entry.state === 'missed' && 'bg-muted',
                entry.state === 'current' && 'border border-foreground/60 border-dashed',
              )}
            >
              <span className="sr-only">{weekLabel(entry, t)}</span>
            </li>
          ))}
        </ol>
        <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground" aria-hidden>
          <span>{t('progress.streak.tenWeeksAgo')}</span>
          <span>{t('progress.streak.thisWeekShort')}</span>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 border-t border-border pt-4">
        {[
          [t('progress.streak.totalWorkouts'), String(total)],
          [t('progress.streak.thisWeek'), `${streak.thisWeek.done} / ${streak.thisWeek.goal}`],
          [t('progress.streak.best'), t('progress.streak.weeksShort', { count: streak.best })],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse gap-1">
            <dt className={KICKER}>{label}</dt>
            <dd className="font-bebas text-3xl leading-none">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Mapa de actividad del mes en curso (antes solo en el inicio). */
export function MonthActivityMap() {
  const { t, i18n } = useTranslation()
  const { getMonthActivity } = useWorkoutActions()
  const monthActivity = getMonthActivity()
  const days = Object.entries(monthActivity)
  const trainedDays = days.filter(([, active]) => active).length
  const todayKey = days.length ? new Date().getDate() - 1 : -1
  const monthName = new Date().toLocaleDateString(safeLocale(i18n.language), { month: 'long' })

  return (
    <section aria-labelledby="progress-month" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 id="progress-month" className={KICKER}>{t('progress.month.title')}</h2>
        <span className="text-xs text-muted-foreground">
          <span className="capitalize">{monthName}</span> · {t('progress.month.trainedDays', { count: trainedDays })}
        </span>
      </div>
      <div className="flex gap-1 flex-wrap" role="img" aria-label={t('progress.month.aria', { month: monthName, count: trainedDays })}>
        {days.map(([date, active], i) => (
          <div
            key={date}
            className={cn(
              'size-5 rounded-[4px]',
              active ? 'bg-lime' : 'bg-muted',
              i === todayKey && 'ring-1 ring-foreground/70',
            )}
          />
        ))}
      </div>
    </section>
  )
}

interface RowProps {
  title: string
  desc: ReactNode
  dot?: boolean
  onClick?: () => void
  to?: string
  expanded?: boolean
  controls?: string
}

function Row({ title, desc, dot, onClick, to, expanded, controls }: RowProps) {
  const body = (
    <>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {dot ? <span className="size-2 rounded-full bg-lime" aria-hidden /> : null}
        </span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <Chevron down={expanded !== undefined} open={expanded} />
    </>
  )
  const cls = 'w-full text-left flex items-center gap-3 min-h-14 py-2 -mx-2 px-2 rounded-md hover:bg-muted/40 transition-colors'
  return to
    ? <Link to={to} className={cls}>{body}</Link>
    : <button type="button" onClick={onClick} aria-expanded={expanded} aria-controls={controls} className={cls}>{body}</button>
}

/**
 * «Tu semana, salud y cuerpo»: lo que salió del inicio y ahora vive en Progreso.
 * El resumen semanal y el cardio se despliegan aquí mismo; fotos y peso abren
 * la pestaña Cuerpo.
 */
export function ProgressMoreRows({ onOpenBody, lastWeight }: { onOpenBody: () => void; lastWeight: { kg: number; date: string } | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { userId } = useAuthState()
  const { activeProgram, programProgress } = useWorkoutState()
  const { getTotalSessions } = useWorkoutActions()
  const { weeklyStats, lastSession } = useCardioStats(userId ?? null)
  const { entries: sleepEntries } = useSleep(userId ?? null)
  const { getPhotosByPhase } = useBodyPhotos(userId ?? null)
  const [open, setOpen] = useState<'insights' | 'cardio' | null>(null)
  const insightsId = useId()
  const cardioId = useId()

  const phase = programProgress.currentPhase || 1
  // Lógica del antiguo `PhasePhotoBanner`: ya entrenó y aún no hay fotos de la fase.
  const photosDue = !!activeProgram && getTotalSessions() > 0 && getPhotosByPhase(phase).length === 0
  const lastSleep = sleepEntries[0]

  const sleepDesc = useMemo(() => {
    if (!lastSleep?.duration_minutes) return t('progress.more.sleepEmpty')
    const h = Math.floor(lastSleep.duration_minutes / 60)
    const m = lastSleep.duration_minutes % 60
    return t('progress.more.sleepLast', { hours: h, minutes: m })
  }, [lastSleep, t])

  const toggle = (key: 'insights' | 'cardio') => setOpen(prev => (prev === key ? null : key))

  return (
    <section aria-labelledby="progress-more" className="flex flex-col gap-2">
      <h2 id="progress-more" className={KICKER}>{t('progress.more.title')}</h2>
      <ul className="border-t border-border [&>li]:border-b [&>li]:border-border">
        <li>
          <Row title={t('progress.more.insights')} desc={t('progress.more.insightsDesc')} onClick={() => toggle('insights')} expanded={open === 'insights'} controls={insightsId} />
          {open === 'insights' ? (
            <div id={insightsId} className="pb-4 space-y-4">
              <InsightsCard userId={userId ?? null} />
              <InsightsHistory userId={userId ?? null} />
            </div>
          ) : null}
        </li>
        <li>
          <Row
            title={t('progress.more.cardio')}
            desc={weeklyStats.totalSessions > 0
              ? t('progress.more.cardioDesc', { km: weeklyStats.totalDistance.toFixed(1), count: weeklyStats.totalSessions })
              : t('progress.more.cardioEmpty')}
            onClick={() => toggle('cardio')} expanded={open === 'cardio'} controls={cardioId}
          />
          {open === 'cardio' ? (
            <div id={cardioId} className="pb-4">
              <CardioWidget weeklyStats={weeklyStats} lastSession={lastSession ?? null} onNavigate={() => navigate('/cardio')} />
            </div>
          ) : null}
        </li>
        <li><Row title={t('nav.calendar')} desc={t('progress.more.calendarDesc')} to="/calendar" /></li>
        <li><Row title={t('nav.sleep')} desc={sleepDesc} to="/sleep" /></li>
        <li>
          <Row
            title={t('progress.more.photos')}
            desc={photosDue ? t('progress.more.photosDue', { phase }) : t('progress.more.photosDesc')}
            dot={photosDue} onClick={onOpenBody}
          />
        </li>
        <li>
          <Row
            title={t('progress.more.weight')}
            desc={lastWeight ? t('progress.more.weightLast', { kg: lastWeight.kg, date: lastWeight.date }) : t('progress.more.weightEmpty')}
            onClick={onOpenBody}
          />
        </li>
      </ul>
    </section>
  )
}
