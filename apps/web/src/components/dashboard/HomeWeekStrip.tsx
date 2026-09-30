/**
 * Semana del inicio (#855): 7 celdas de lunes a domingo (`getWeekSummary`,
 * #853) y, debajo, la racha semanal o, la primera semana, la meta «3 en 7
 * días». En escritorio (≥1024 px) la fila pasa a lista vertical con el nombre
 * del entreno de cada día (tablero Web-Escritorio).
 *
 * La racha rota no se enseña: con `current === 0` no hay línea.
 */
import { useTranslation } from 'react-i18next'
import { Check, Flame } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { WeekCell, WeekSummary } from '@calistenia/core/lib/weekSummary'
import type { WeeklyStreak } from '@calistenia/core/lib/weeklyStreak'
import type { HomeFirstWeek } from '@calistenia/core/lib/homeState'
import type { WeekDay } from '@calistenia/core/types'

interface HomeWeekStripProps {
  week: WeekSummary
  /** Objetivo efectivo; `null` sin programa (se cuenta sin «de N»). */
  goal: number | null
  streak: WeeklyStreak
  firstWeek: HomeFirstWeek | null
  deload: boolean
  /** Semana tipo del programa activo (para el nombre de cada día en escritorio). */
  weekDays: readonly WeekDay[]
  /** Título y minutos estimados del entreno de un día (escritorio). */
  dayInfo?: (dayId: string) => { title: string | null; minutes: number | null }
}

function dayName(cell: WeekCell, locale: string, style: 'narrow' | 'short' | 'long'): string {
  const label = new Date(`${cell.day}T12:00:00`).toLocaleDateString(locale, { weekday: style })
  return label.charAt(0).toUpperCase() + label.slice(1).replace('.', '')
}

function cellLabelKey(cell: WeekCell): string {
  switch (cell.state) {
    case 'done': return 'home.week.cell.done'
    case 'in_progress': return 'home.week.cell.inProgress'
    case 'before_start': return 'home.week.cell.beforeStart'
    case 'today': return cell.trainable ? 'home.week.cell.today' : 'home.week.cell.todayRest'
    case 'planned': return 'home.week.cell.planned'
    default: return 'home.week.cell.rest'
  }
}

function focusOf(t: (k: string) => string, weekDays: readonly WeekDay[], cell: WeekCell): string | null {
  const day = weekDays.find(d => d.id === cell.dayId)
  if (!day || !cell.trainable) return null
  return day.focusKey ? t(day.focusKey) : day.focus || null
}

export default function HomeWeekStrip({ week, goal, streak, firstWeek, deload, weekDays, dayInfo }: HomeWeekStripProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  return (
    <section data-testid="home-week-plan" aria-labelledby="home-week-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 id="home-week-title" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {t('home.week.title')}
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-wider">
          <span className="font-bebas text-lg tracking-normal lg:text-xl" data-testid="home-week-count">
            {goal
              ? t('home.week.count', { done: week.done, count: goal })
              : t('home.week.countNoPlan', { count: week.done })}
          </span>
        </span>
      </div>

      {/* Móvil y tableta: 7 celdas */}
      <ol className="grid grid-cols-7 gap-1.5 lg:hidden">
        {week.cells.map(cell => {
          const label = t(cellLabelKey(cell), { day: dayName(cell, locale, 'long') })
          return (
            <li key={cell.day} className="flex flex-col items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn('font-mono text-[10px] uppercase tracking-wider', cell.isToday ? 'text-foreground' : 'text-muted-foreground')}
              >
                {dayName(cell, locale, 'narrow')}
              </span>
              <div
                role="img"
                aria-label={label}
                className={cn(
                  'flex aspect-square w-full max-w-10 items-center justify-center rounded-lg',
                  cell.state === 'done' && 'border border-lime/40 bg-lime/10',
                  cell.state === 'done' && cell.isToday && 'border-2 border-foreground',
                  cell.state === 'in_progress' && 'border-2 border-lime',
                  cell.state === 'today' && 'border-2 border-foreground',
                  cell.state === 'planned' && 'border border-border',
                  cell.state === 'rest' && 'border border-dashed border-border text-muted-foreground',
                  cell.state === 'before_start' && 'border border-dashed border-border/60',
                )}
              >
                {cell.state === 'done' && <Check className="size-4 text-lime-text" strokeWidth={2.5} aria-hidden="true" />}
                {cell.state === 'in_progress' && <span className="size-2 rounded-full bg-lime motion-safe:animate-pulse" aria-hidden="true" />}
                {cell.state === 'today' && (
                  <span className="font-mono text-[10px] uppercase" aria-hidden="true">{t('home.week.todayShort')}</span>
                )}
                {cell.state === 'planned' && <span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />}
                {cell.state === 'rest' && <span aria-hidden="true">–</span>}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Escritorio: lista vertical con el entreno de cada día */}
      <ol className="hidden border-t border-border lg:block">
        {week.cells.map(cell => {
          const info = cell.trainable && dayInfo ? dayInfo(cell.dayId) : null
          const focus = info?.title || focusOf(t, weekDays, cell)
          const minutes = focus ? info?.minutes ?? null : null
          const label = t(cellLabelKey(cell), { day: dayName(cell, locale, 'long') })
          return (
            <li
              key={cell.day}
              aria-label={label}
              className={cn(
                'flex h-10 items-center gap-3 border-b border-border text-sm',
                cell.isToday ? '-mx-2.5 rounded-md bg-card px-2.5 font-medium' : 'text-muted-foreground',
                cell.isToday && cell.state !== 'done' && 'text-foreground',
              )}
            >
              <span className={cn('w-9 font-mono text-[11px] uppercase tracking-wider', cell.isToday && 'text-lime-text')} aria-hidden="true">
                {dayName(cell, locale, 'short').slice(0, 3)}
              </span>
              <span className={cn('flex-1 truncate', focus && !cell.isToday && cell.state !== 'done' && 'text-foreground')} aria-hidden="true">
                {focus ?? t('home.week.rest')}
              </span>
              {cell.state === 'done' && <Check className="size-4 text-lime-text" strokeWidth={2.5} aria-hidden="true" />}
              {cell.state === 'in_progress' && <span className="size-2 rounded-full bg-lime" aria-hidden="true" />}
              {cell.isToday && cell.state !== 'done' && cell.state !== 'in_progress' && (
                <span className="font-mono text-[11px] uppercase tracking-wider text-lime-text" aria-hidden="true">{t('home.week.todayShort')}</span>
              )}
              {!cell.isToday && cell.state === 'planned' && minutes ? (
                <span className="font-mono text-[11px] tracking-wider" aria-hidden="true">{minutes} min</span>
              ) : null}
            </li>
          )
        })}
      </ol>

      {firstWeek ? (
        <FirstWeekGoal firstWeek={firstWeek} />
      ) : streak.current > 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground" data-testid="home-streak">
          <Flame className="size-3.5 shrink-0 text-lime-text" aria-hidden="true" />
          <span>
            <span className="font-medium text-foreground">{t('home.streak.weeks', { count: streak.current })}</span>
            {' '}
            {deload
              ? `· ${t('home.streak.deloadCounts')}`
              : streak.thisWeek.met
                ? t('home.streak.meetingGoal')
                : `${t('home.streak.meetingGoal')} · ${t('home.streak.remaining', { count: streak.thisWeek.remaining })}`}
          </span>
        </p>
      ) : null}
    </section>
  )
}

export function FirstWeekGoal({ firstWeek }: { firstWeek: HomeFirstWeek }) {
  const { t } = useTranslation()
  const done = Math.min(firstWeek.done, firstWeek.target)
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-xl border border-border p-4" data-testid="home-first-week">
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t('home.firstWeek.title')}</h3>
        <span className="font-bebas text-xl leading-none">{t('home.firstWeek.progress', { done, target: firstWeek.target })}</span>
      </div>
      <div
        className="flex gap-1.5"
        role="img"
        aria-label={t('activation.a11yProgress', { done, total: firstWeek.target })}
      >
        {Array.from({ length: firstWeek.target }, (_, i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i < done ? 'bg-lime' : 'bg-muted')} />
        ))}
      </div>
      <p className="text-[13px] text-muted-foreground">
        {firstWeek.reached
          ? t('home.firstWeek.reached', { target: firstWeek.target })
          : done === 0
            ? t('home.firstWeek.hintStart', { target: firstWeek.target })
            : t('home.firstWeek.hint', { target: firstWeek.target, count: firstWeek.daysRemaining })}
      </p>
    </div>
  )
}
