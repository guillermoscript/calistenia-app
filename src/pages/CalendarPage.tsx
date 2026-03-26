import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import { cn } from '../lib/utils'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { useWorkoutState } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { localMidnightAsUTC, utcToLocalDateStr } from '../lib/dateUtils'
import type { SessionDone, WeekDay, CardioSession } from '../types'

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  // Monday-based: 0=Mon..6=Sun
  const startOffset = (first.getDay() + 6) % 7
  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= lastDay; d++) days.push(d)
  return days
}

function formatDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface CalendarEntry {
  type: 'workout' | 'cardio'
  date: string
  workoutKey: string
  note: string
  // Cardio-specific fields
  activityType?: string
  distanceKm?: number
  durationSeconds?: number
}

interface DayNutritionSummary {
  meals: number
  calories: number
}

interface DayWaterSummary {
  totalMl: number
}

export default function CalendarPage() {
  const { t } = useTranslation()
  const { progress, weekDays, activeProgram, settings } = useWorkoutState()
  const { userId } = useAuthState()
  const currentPhase = settings.phase
  const navigate = useNavigate()
  const onGoToWorkout = useCallback(() => navigate('/workout'), [navigate])
  const DAY_NAMES = useMemo(() => Array.from({length: 7}, (_, i) => t(`dayShort.${i}`)), [t])
  const MONTH_NAMES = useMemo(() => Array.from({length: 12}, (_, i) => t(`month.${i}`)), [t])
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [cardioSessions, setCardioSessions] = useState<CardioSession[]>([])
  const [nutritionByDate, setNutritionByDate] = useState<Record<string, DayNutritionSummary>>({})
  const [waterByDate, setWaterByDate] = useState<Record<string, DayWaterSummary>>({})

  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate())
  const days = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth])

  // Re-fetch when user returns to the tab
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    const handler = () => { if (!document.hidden) setRefreshKey(k => k + 1) }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  // Fetch cardio, nutrition, and water data for this month
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const monthStart = formatDate(viewYear, viewMonth, 1)
    const nextMonth = viewMonth === 11
      ? formatDate(viewYear + 1, 0, 1)
      : formatDate(viewYear, viewMonth + 1, 1)
    const pbStart = localMidnightAsUTC(monthStart)
    const pbEnd = localMidnightAsUTC(nextMonth)

    const load = async () => {
      const available = await isPocketBaseAvailable()
      if (!available || cancelled) return

      // Fetch all three in parallel
      const [cardioRes, nutritionRes, waterRes] = await Promise.allSettled([
        pb.collection('cardio_sessions').getList(1, 200, {
          filter: pb.filter('user = {:uid} && started_at >= {:start} && started_at < {:end}', {
            uid: userId, start: pbStart, end: pbEnd,
          }),
          sort: '-started_at',
          fields: 'id,activity_type,distance_km,duration_seconds,started_at,finished_at,note',
        }),
        pb.collection('nutrition_entries').getList(1, 500, {
          filter: pb.filter('user = {:uid} && logged_at >= {:start} && logged_at < {:end}', {
            uid: userId, start: pbStart, end: pbEnd,
          }),
          fields: 'id,logged_at,total_calories',
        }),
        pb.collection('water_entries').getList(1, 500, {
          filter: pb.filter('user = {:uid} && logged_at >= {:start} && logged_at < {:end}', {
            uid: userId, start: pbStart, end: pbEnd,
          }),
          fields: 'id,logged_at,amount_ml',
        }),
      ])

      if (cancelled) return

      // Cardio
      if (cardioRes.status === 'fulfilled') {
        setCardioSessions(cardioRes.value.items as unknown as CardioSession[])
      } else {
        console.warn('Calendar: cardio fetch failed', cardioRes.reason)
      }

      // Nutrition — aggregate by date (convert UTC timestamps to local dates)
      if (nutritionRes.status === 'fulfilled') {
        const map: Record<string, DayNutritionSummary> = {}
        for (const item of nutritionRes.value.items) {
          const date = utcToLocalDateStr((item as any).logged_at || '')
          if (!date) continue
          if (!map[date]) map[date] = { meals: 0, calories: 0 }
          map[date].meals++
          map[date].calories += (item as any).total_calories || 0
        }
        setNutritionByDate(map)
      } else {
        console.warn('Calendar: nutrition fetch failed', nutritionRes.reason)
      }

      // Water — aggregate by date (convert UTC timestamps to local dates)
      if (waterRes.status === 'fulfilled') {
        const map: Record<string, DayWaterSummary> = {}
        for (const item of waterRes.value.items) {
          const date = utcToLocalDateStr((item as any).logged_at || '')
          if (!date) continue
          if (!map[date]) map[date] = { totalMl: 0 }
          map[date].totalMl += (item as any).amount_ml || 0
        }
        setWaterByDate(map)
      } else {
        console.warn('Calendar: water fetch failed', waterRes.reason)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId, viewYear, viewMonth, refreshKey])

  // Build a map of date → entries for this month (workouts + cardio)
  const sessionsByDate = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {}

    // Workout sessions from progress
    Object.entries(progress).forEach(([key, val]) => {
      if (!key.startsWith('done_')) return
      const session = val as SessionDone
      if (!session.date) return
      if (!map[session.date]) map[session.date] = []
      map[session.date].push({
        type: 'workout',
        date: session.date,
        workoutKey: session.workoutKey,
        note: session.note || '',
      })
    })

    // Cardio sessions
    cardioSessions.forEach(cs => {
      const date = utcToLocalDateStr(cs.started_at || '')
      if (!date) return
      if (!map[date]) map[date] = []
      map[date].push({
        type: 'cardio',
        date,
        workoutKey: `cardio_${cs.id}`,
        note: cs.note || '',
        activityType: cs.activity_type,
        distanceKm: cs.distance_km,
        durationSeconds: cs.duration_seconds,
      })
    })

    return map
  }, [progress, cardioSessions])

  const selectedSessions = selectedDate ? sessionsByDate[selectedDate] || [] : []

  // Stats for current month
  const monthStats = useMemo(() => {
    let totalSessions = 0
    let activeDays = 0
    days.forEach(d => {
      if (d === null) return
      const date = formatDate(viewYear, viewMonth, d)
      const count = sessionsByDate[date]?.length || 0
      if (count > 0) { totalSessions += count; activeDays++ }
    })
    return { totalSessions, activeDays }
  }, [days, viewYear, viewMonth, sessionsByDate])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }
  const goToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelectedDate(todayStr)
  }

  // Get planned workout for a date based on weekday
  const getPlannedWorkout = (dateStr: string): WeekDay | null => {
    if (!weekDays || weekDays.length === 0) return null
    const d = new Date(dateStr + 'T12:00:00')
    const jsDay = d.getDay() // 0=Sun
    const dayMap = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']
    const dayId = dayMap[jsDay]
    return weekDays.find(wd => wd.id === dayId) || null
  }

  const selectedPlanned = selectedDate ? getPlannedWorkout(selectedDate) : null

  // Workout key to readable title
  const parseWorkoutKey = (key: string) => {
    if (key.startsWith('free_')) return t('calendar.freeSession')
    if (key.startsWith('cardio_')) return t('calendar.cardio', { defaultValue: 'Cardio' })
    const [phaseStr, day] = key.split('_')
    const phase = phaseStr.replace('p', '')
    return t('calendar.phaseDay', { phase, day: t(`day.${day}`) || day })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('calendar.section')}</div>
      <div className="font-bebas text-4xl md:text-5xl mb-6">{t('calendar.title')}</div>

      {/* Month navigation */}
      <div id="tour-calendar-nav" className="flex items-center justify-between mb-6">
        <Button variant="outline" size="sm" onClick={prevMonth} aria-label={t('calendar.prevMonth')} className="h-8 px-3 text-xs">
          ‹
        </Button>
        <div className="text-center">
          <div className="font-bebas text-2xl">{MONTH_NAMES[viewMonth]} {viewYear}</div>
          <div className="text-[10px] text-muted-foreground tracking-widest">
            {t('calendar.activeDays', { count: monthStats.activeDays })} · {t('calendar.sessionCount', { count: monthStats.totalSessions })}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={goToday} className="h-8 px-3 text-[10px] tracking-widest">
            {t('calendar.todayBtn')}
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth} aria-label={t('calendar.nextMonth')} className="h-8 px-3 text-xs">
            ›
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <Card id="tour-calendar-grid" className="mb-6">
        <CardContent className="p-4 md:p-6">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[10px] text-muted-foreground tracking-widest font-mono">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              if (d === null) return <div key={`empty-${i}`} />
              const date = formatDate(viewYear, viewMonth, d)
              const sessions = sessionsByDate[date] || []
              const nutrition = nutritionByDate[date]
              const water = waterByDate[date]
              const isToday = date === todayStr
              const isSelected = date === selectedDate
              const hasSession = sessions.length > 0
              const hasAnyData = hasSession || !!nutrition || !!water
              const isFuture = date > todayStr

              return (
                <button
                  key={date}
                  aria-label={`${d} ${t(`month.${viewMonth}`)}${hasSession ? `, ${t('calendar.sessionLabel', { count: sessions.length })}` : ''}${nutrition ? `, ${t('calendar.mealLabel', { count: nutrition.meals })}` : ''}${isToday ? `, ${t('common.today').toLowerCase()}` : ''}`}
                  onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={cn(
                    'aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all text-sm relative',
                    isFuture && 'text-muted-foreground/40',
                    isToday && !isSelected && 'border border-lime/40',
                    isSelected && 'border-2 border-lime bg-lime/10',
                    hasSession && !isSelected && 'bg-lime/15 text-lime',
                    !hasSession && hasAnyData && !isSelected && 'bg-muted/40',
                    !hasAnyData && !isToday && !isSelected && 'hover:bg-muted',
                  )}
                >
                  <span className={cn(
                    'font-mono text-[13px]',
                    hasSession && 'font-bold',
                  )}>
                    {d}
                  </span>
                  {hasAnyData && (
                    <div className="flex gap-0.5">
                      {sessions.slice(0, 2).map((s, j) => (
                        <div key={j} className={cn(
                          'size-1 rounded-full',
                          s.type === 'cardio' ? 'bg-sky-400' : s.workoutKey.startsWith('free_') ? 'bg-violet-400' : 'bg-lime',
                        )} />
                      ))}
                      {nutrition && <div className="size-1 rounded-full bg-amber-400" />}
                      {water && <div className="size-1 rounded-full bg-cyan-400" />}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected day detail */}
      {selectedDate && (
        <Card id="tour-calendar-detail">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString(i18n.language, {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </div>
                <div className="text-sm">
                  {selectedSessions.length > 0
                    ? t('calendar.sessionLabel', { count: selectedSessions.length })
                    : t('calendar.noWorkouts')
                  }
                </div>
              </div>
              {selectedDate === todayStr && selectedSessions.length === 0 && (
                <Button
                  onClick={onGoToWorkout}
                  size="sm"
                  className="bg-lime text-lime-foreground hover:bg-lime/90 text-[10px] font-bold tracking-widest"
                >
                  {t('calendar.train')}
                </Button>
              )}
            </div>

            {selectedSessions.length > 0 ? (
              <div className="space-y-2">
                {selectedSessions.map((s, i) => {
                  const isCardio = s.type === 'cardio'
                  const isFree = s.workoutKey.startsWith('free_')
                  const accentHover = isCardio ? 'hover:border-sky-400/30' : isFree ? 'hover:border-violet-400/30' : 'hover:border-lime/30'
                  const titleColor = isCardio ? 'text-sky-400' : isFree ? 'text-violet-400' : ''

                  const cardioLabel = isCardio && s.activityType
                    ? { running: t('calendar.running'), walking: t('calendar.walking'), cycling: t('calendar.cycling') }[s.activityType] || 'Cardio'
                    : null

                  const cardioMeta = isCardio && s.distanceKm
                    ? `${s.distanceKm.toFixed(2)} km${s.durationSeconds ? ` · ${Math.floor(s.durationSeconds / 60)} min` : ''}`
                    : null

                  return (
                    <button
                      key={i}
                      onClick={() => !isCardio ? navigate(`/session/${s.date}/${s.workoutKey}`) : navigate('/cardio')}
                      className={cn('w-full text-left px-4 py-3 bg-muted/30 rounded-lg border border-border transition-colors flex items-center justify-between gap-3', accentHover)}
                    >
                      <div>
                        <div className={cn('text-sm font-medium', titleColor)}>
                          {isCardio ? (cardioLabel || 'Cardio') : parseWorkoutKey(s.workoutKey)}
                        </div>
                        {cardioMeta && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">{cardioMeta}</div>
                        )}
                        {s.note && (
                          <div className="text-xs text-muted-foreground mt-1 italic">{s.note}</div>
                        )}
                      </div>
                      <svg className="size-4 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6,3 11,8 6,13" /></svg>
                    </button>
                  )
                })}
              </div>
            ) : selectedPlanned ? (
              <div>
                {selectedPlanned.type === 'rest' ? (
                  <div className="text-xs text-muted-foreground">{t('calendar.restDay')}</div>
                ) : (
                  <div className="px-4 py-3 bg-muted/20 rounded-lg border border-border/60 border-l-[3px] border-l-lime/40">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[9px] tracking-wide border-lime/30 text-lime bg-lime/10">
                        {t('calendar.planned')}
                      </Badge>
                      {activeProgram && (
                        <span className="text-[9px] text-muted-foreground">{activeProgram.name}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium">{selectedPlanned.focus}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {selectedPlanned.name} · {t('workout.phase')} {currentPhase || 1}
                    </div>
                  </div>
                )}
              </div>
            ) : selectedDate <= todayStr ? (
              <div className="text-xs text-muted-foreground">{t('calendar.noTraining')}</div>
            ) : (
              <div className="text-xs text-muted-foreground">{t('calendar.upcoming')}</div>
            )}

            {/* Nutrition & Water summary for selected day */}
            {selectedDate && (nutritionByDate[selectedDate] || waterByDate[selectedDate]) && (
              <div className={cn('flex gap-4 flex-wrap', selectedSessions.length > 0 || selectedPlanned ? 'mt-4 pt-4 border-t border-border/60' : 'mt-2')}>
                {nutritionByDate[selectedDate] && (
                  <button
                    onClick={() => navigate(`/nutrition?date=${selectedDate}`)}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-400/5 border border-amber-400/15 rounded-lg hover:border-amber-400/30 transition-colors"
                  >
                    <div className="size-2 rounded-full bg-amber-400" />
                    <div className="text-[11px]">
                      <span className="text-amber-400 font-medium">{t('calendar.mealLabel', { count: nutritionByDate[selectedDate].meals })}</span>
                      <span className="text-muted-foreground ml-1.5">{nutritionByDate[selectedDate].calories} kcal</span>
                    </div>
                  </button>
                )}
                {waterByDate[selectedDate] && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-cyan-400/5 border border-cyan-400/15 rounded-lg">
                    <div className="size-2 rounded-full bg-cyan-400" />
                    <div className="text-[11px]">
                      <span className="text-cyan-400 font-medium">{waterByDate[selectedDate].totalMl} ml</span>
                      <span className="text-muted-foreground ml-1.5">{t('calendar.waterLabel')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
