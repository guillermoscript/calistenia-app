import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'
import { ChevronLeft, ChevronRight, Dumbbell, Activity, Repeat, Sparkles, Utensils, Droplet, Moon, Scale, Ruler, Camera, ShieldCheck, ChevronRight as Caret } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { utcToLocalDateStr, todayStr } from '@calistenia/core/lib/dateUtils'
import { fetchMonthActivity, emptyMonthActivity, type MonthActivity } from '@calistenia/core/lib/monthActivity'
import type { SessionDone, WeekDay } from '@calistenia/core/types'

// Acentos por tipo de actividad (paridad con el calendario web).
const ACCENT = {
  workout: { dot: 'bg-lime', text: 'text-lime', icon: 'hsl(74 90% 45%)', chip: 'bg-lime/10 border-lime/20' },
  cardio: { dot: 'bg-sky-400', text: 'text-sky-400', icon: '#38bdf8', chip: 'bg-sky-400/10 border-sky-400/20' },
  circuit: { dot: 'bg-orange-500', text: 'text-orange-500', icon: '#f97316', chip: 'bg-orange-500/10 border-orange-500/20' },
  free: { dot: 'bg-violet-400', text: 'text-violet-400', icon: '#a78bfa', chip: 'bg-violet-400/10 border-violet-400/20' },
  nutrition: { dot: 'bg-amber-400', text: 'text-amber-400', icon: '#fbbf24', chip: 'bg-amber-400/10 border-amber-400/20' },
  water: { dot: 'bg-cyan-400', text: 'text-cyan-400', icon: '#22d3ee', chip: 'bg-cyan-400/10 border-cyan-400/20' },
  sleep: { dot: 'bg-indigo-400', text: 'text-indigo-400', icon: '#818cf8', chip: 'bg-indigo-400/10 border-indigo-400/20' },
  weight: { dot: 'bg-rose-400', text: 'text-rose-400', icon: '#fb7185', chip: 'bg-rose-400/10 border-rose-400/20' },
  measurement: { dot: 'bg-teal-400', text: 'text-teal-400', icon: '#2dd4bf', chip: 'bg-teal-400/10 border-teal-400/20' },
  photo: { dot: 'bg-fuchsia-400', text: 'text-fuchsia-400', icon: '#e879f9', chip: 'bg-fuchsia-400/10 border-fuchsia-400/20' },
  lumbar: { dot: 'bg-emerald-400', text: 'text-emerald-400', icon: '#34d399', chip: 'bg-emerald-400/10 border-emerald-400/20' },
} as const

type CalEntry =
  | { type: 'workout'; date: string; workoutKey: string; note: string }
  | { type: 'free'; date: string; workoutKey: string; note: string }
  | { type: 'cardio'; date: string; id: string; activityType: string; distanceKm: number; durationSeconds: number; note: string }
  | { type: 'circuit'; date: string; id: string; name: string; mode?: 'circuit' | 'timed'; roundsCompleted?: number; roundsTarget?: number; durationSeconds?: number; note: string }

function getMonthDays(year: number, month0: number): (number | null)[] {
  const first = new Date(year, month0, 1)
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  const startOffset = (first.getDay() + 6) % 7 // lunes primero
  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= lastDay; d++) days.push(d)
  while (days.length % 7 !== 0) days.push(null)
  return days
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`

export default function CalendarScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null
  const { progress, weekDays, activeProgram, settings } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()

  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [data, setData] = useState<MonthActivity>(emptyMonthActivity())
  const [refreshKey, setRefreshKey] = useState(0)

  const today = todayStr()
  const days = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth])
  const weeks = useMemo(() => {
    const out: (number | null)[][] = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [days])

  const DAY_NAMES = useMemo(() => Array.from({ length: 7 }, (_, i) => t(`dayShort.${i}`)), [t])
  const MONTH_NAMES = useMemo(() => Array.from({ length: 12 }, (_, i) => t(`month.${i}`)), [t])

  // Carga del mes vía el util compartido (bucketing TZ-correcto vive ahí).
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchMonthActivity(userId, viewYear, viewMonth).then(res => {
      if (!cancelled) setData(res)
    })
    return () => { cancelled = true }
  }, [userId, viewYear, viewMonth, refreshKey])

  // Refresca al volver a la pestaña (equivalente al visibilitychange web).
  // Saltamos el primer focus: coincide con el montaje, que el useEffect de arriba
  // ya cubre — así evitamos un doble fetch en la carga inicial.
  const didMount = useRef(false)
  useFocusEffect(useCallback(() => {
    if (!didMount.current) { didMount.current = true; return }
    setRefreshKey(k => k + 1)
  }, []))

  // Mapa fecha → entradas (entrenos del progress + cardio + circuit del mes).
  const entriesByDate = useMemo(() => {
    const map: Record<string, CalEntry[]> = {}
    const push = (date: string, e: CalEntry) => { (map[date] || (map[date] = [])).push(e) }

    Object.entries(progress).forEach(([key, val]) => {
      if (!key.startsWith('done_')) return
      const s = val as SessionDone
      if (!s.done || s.cardioSessionId || !s.date) return
      const isFree = s.workoutKey.startsWith('free_') || s.workoutKey.startsWith('manual_')
      push(s.date, { type: isFree ? 'free' : 'workout', date: s.date, workoutKey: s.workoutKey, note: s.note || '' })
    })

    data.cardio.forEach(cs => {
      const date = utcToLocalDateStr(cs.started_at || '')
      if (!date || !cs.id) return
      push(date, { type: 'cardio', date, id: cs.id, activityType: cs.activity_type, distanceKm: cs.distance_km ?? 0, durationSeconds: cs.duration_seconds ?? 0, note: cs.note || '' })
    })

    data.circuits.forEach(cs => {
      const date = utcToLocalDateStr(cs.started_at || '')
      if (!date) return
      const name = typeof cs.circuit_name === 'object' && cs.circuit_name !== null
        ? ((cs.circuit_name as Record<string, string>)[i18n.language] || (cs.circuit_name as Record<string, string>).en || (cs.circuit_name as Record<string, string>).es || '')
        : (typeof cs.circuit_name === 'string' ? cs.circuit_name : '')
      push(date, { type: 'circuit', date, id: cs.id, name, mode: cs.mode, roundsCompleted: cs.rounds_completed, roundsTarget: cs.rounds_target, durationSeconds: cs.duration_seconds, note: cs.note || '' })
    })

    return map
  }, [progress, data])

  const monthStats = useMemo(() => {
    let activeDays = 0, totalSessions = 0
    for (const d of days) {
      if (d === null) continue
      const date = ymd(viewYear, viewMonth, d)
      const n = entriesByDate[date]?.length || 0
      totalSessions += n
      // "Día activo" = cualquier dato registrado (sesión o bienestar), para que
      // el contador coincida con los puntos que pinta la cuadrícula.
      const hasWellness = !!data.nutritionByDate[date] || !!data.waterByDate[date]
        || !!data.sleepByDate[date] || !!data.weightByDate[date]
        || !!data.measurementByDate[date] || !!data.photosByDate[date] || !!data.lumbarByDate[date]
      if (n > 0 || hasWellness) activeDays++
    }
    return { activeDays, totalSessions }
  }, [days, viewYear, viewMonth, entriesByDate, data])

  const selectedEntries = selectedDate ? entriesByDate[selectedDate] || [] : []

  const prevMonth = () => { haptics.selection(); if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { haptics.selection(); if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) } else setViewMonth(m => m + 1) }
  const goToday = () => { haptics.selection(); const n = new Date(); setViewYear(n.getFullYear()); setViewMonth(n.getMonth()); setSelectedDate(todayStr()) }

  // Entreno planificado del día (según weekday del programa activo).
  const plannedFor = (dateStr: string): WeekDay | null => {
    if (!weekDays || weekDays.length === 0) return null
    const jsDay = new Date(dateStr + 'T12:00:00').getDay()
    const dayId = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][jsDay]
    return weekDays.find(wd => wd.id === dayId) || null
  }
  const selectedPlanned = selectedDate ? plannedFor(selectedDate) : null

  // Título legible para un entreno de fuerza/yoga (igual que el historial).
  const workoutTitle = (key: string): string => {
    if (key.startsWith('free_') || key.startsWith('manual_')) return t('progress.freeSession')
    const m = /^p(\d+)_(\w+)$/.exec(key)
    if (m) {
      const w = getWorkout(parseInt(m[1]), m[2])
      if (w?.title) return w.title
      return `${t('workout.phaseLabel', { phase: m[1] })} · ${t(`day.${m[2]}`, { defaultValue: m[2] })}`
    }
    return key
  }

  const cardioLabel = (type: string) => t(`cardio.${type}`, { defaultValue: type })

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 pb-10 pt-2 gap-4">
        {/* Cabecera */}
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('calendar.section')}</Text>
          <Text className="font-bebas text-4xl leading-none text-foreground">{t('calendar.title')}</Text>
        </View>

        {/* Navegación de mes */}
        <View className="flex-row items-center justify-between">
          <Pressable onPress={prevMonth} hitSlop={10} className="size-9 items-center justify-center rounded-lg border border-border active:opacity-60">
            <ChevronLeft size={18} color="hsl(0 0% 55%)" />
          </Pressable>
          <View className="items-center">
            <Text className="font-bebas text-2xl leading-none text-foreground">{MONTH_NAMES[viewMonth]} {viewYear}</Text>
            <Text className="mt-1 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {t('calendar.activeDays', { count: monthStats.activeDays })} · {t('calendar.sessionCount', { count: monthStats.totalSessions })}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable onPress={goToday} hitSlop={10} className="h-9 items-center justify-center rounded-lg border border-border px-3 active:opacity-60">
              <Text className="font-mono text-[10px] uppercase tracking-[2px] text-foreground">{t('calendar.todayBtn')}</Text>
            </Pressable>
            <Pressable onPress={nextMonth} hitSlop={10} className="size-9 items-center justify-center rounded-lg border border-border active:opacity-60">
              <ChevronRight size={18} color="hsl(0 0% 55%)" />
            </Pressable>
          </View>
        </View>

        {/* Cuadrícula del mes */}
        <Card>
          <CardContent className="py-4">
            <View className="flex-row">
              {DAY_NAMES.map(d => (
                <View key={d} className="flex-1 items-center">
                  <Text className="font-mono text-[9px] uppercase tracking-[1px] text-muted-foreground">{d}</Text>
                </View>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} className="mt-1 flex-row">
                {week.map((d, di) => {
                  if (d === null) return <View key={di} className="flex-1 aspect-square" />
                  const date = ymd(viewYear, viewMonth, d)
                  const entries = entriesByDate[date] || []
                  const nutrition = data.nutritionByDate[date]
                  const water = data.waterByDate[date]
                  const sleep = data.sleepByDate[date]
                  const weight = data.weightByDate[date]
                  const measurement = data.measurementByDate[date]
                  const photos = data.photosByDate[date]
                  const lumbar = data.lumbarByDate[date]
                  const hasSession = entries.length > 0
                  const hasAny = hasSession || !!nutrition || !!water || !!sleep || !!weight || !!measurement || !!photos || !!lumbar
                  const isToday = date === today
                  const isSelected = date === selectedDate
                  const isFuture = date > today
                  return (
                    <View key={di} className="flex-1 aspect-square p-0.5">
                      <Pressable
                        onPress={() => { haptics.selection(); setSelectedDate(isSelected ? null : date) }}
                        className={cn(
                          'flex-1 items-center justify-center rounded-lg',
                          isSelected && 'border-2 border-lime bg-lime/10',
                          !isSelected && isToday && 'border border-lime/40',
                          !isSelected && hasSession && 'bg-lime/15',
                          !isSelected && !hasSession && hasAny && 'bg-muted/40',
                        )}
                      >
                        <Text className={cn(
                          'font-mono text-[12px]',
                          isFuture ? 'text-muted-foreground/40' : hasSession && !isSelected ? 'text-lime' : 'text-foreground',
                        )}>{d}</Text>
                        {hasAny && (
                          <View className="mt-0.5 h-1 flex-row gap-0.5">
                            {entries.slice(0, 3).map((e, j) => (
                              <View key={j} className={cn('size-1 rounded-full', ACCENT[e.type].dot)} />
                            ))}
                            {nutrition && <View className={cn('size-1 rounded-full', ACCENT.nutrition.dot)} />}
                            {water && <View className={cn('size-1 rounded-full', ACCENT.water.dot)} />}
                            {sleep && <View className={cn('size-1 rounded-full', ACCENT.sleep.dot)} />}
                            {weight && <View className={cn('size-1 rounded-full', ACCENT.weight.dot)} />}
                            {measurement && <View className={cn('size-1 rounded-full', ACCENT.measurement.dot)} />}
                            {photos && <View className={cn('size-1 rounded-full', ACCENT.photo.dot)} />}
                            {lumbar && <View className={cn('size-1 rounded-full', ACCENT.lumbar.dot)} />}
                          </View>
                        )}
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            ))}
          </CardContent>
        </Card>

        {/* Detalle del día seleccionado */}
        {selectedDate && (
          <Card>
            <CardContent className="gap-3 py-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                  <Text className="mt-0.5 text-sm text-foreground">
                    {selectedEntries.length > 0 ? t('calendar.sessionLabel', { count: selectedEntries.length }) : t('calendar.noWorkouts')}
                  </Text>
                </View>
                {selectedDate === today && selectedEntries.length === 0 && (
                  <Pressable onPress={() => router.push('/session')} className="rounded-lg bg-lime px-3 py-2 active:opacity-80">
                    <Text className="font-mono text-[10px] uppercase tracking-[2px] text-lime-foreground">{t('calendar.train')}</Text>
                  </Pressable>
                )}
              </View>

              {/* Sesiones registradas */}
              {selectedEntries.map((e, i) => {
                const accent = ACCENT[e.type]
                const navigable = e.type === 'workout' || e.type === 'free' || e.type === 'cardio'
                const Icon = e.type === 'cardio' ? Activity : e.type === 'circuit' ? Repeat : e.type === 'free' ? Sparkles : Dumbbell
                const title = e.type === 'cardio' ? cardioLabel(e.activityType)
                  : e.type === 'circuit' ? (e.name || t('nav.circuit'))
                  : workoutTitle(e.workoutKey)
                const meta = e.type === 'cardio'
                  ? `${e.distanceKm.toFixed(2)} km${e.durationSeconds ? ` · ${Math.floor(e.durationSeconds / 60)} min` : ''}`
                  : e.type === 'circuit'
                    ? [
                        e.roundsCompleted != null && e.roundsTarget != null ? `${e.roundsCompleted}/${e.roundsTarget}` : null,
                        e.durationSeconds ? `${Math.floor(e.durationSeconds / 60)} min` : null,
                      ].filter(Boolean).join(' · ')
                    : ''
                const onPress = () => {
                  if (e.type === 'cardio') router.push(`/cardio/${e.id}`)
                  else if (e.type === 'workout' || e.type === 'free') router.push({ pathname: '/session-detail', params: { date: e.date, workoutKey: e.workoutKey, title } })
                }
                return (
                  <Pressable
                    key={i}
                    disabled={!navigable}
                    onPress={onPress}
                    className={cn('flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3', navigable && 'active:opacity-70')}
                  >
                    <View className={cn('size-8 items-center justify-center rounded-full', accent.chip)}>
                      <Icon size={15} color={accent.icon} />
                    </View>
                    <View className="flex-1">
                      <Text className={cn('font-sans-medium', accent.text)} numberOfLines={1}>{title}</Text>
                      {!!meta && <Text className="mt-0.5 font-mono text-[11px] text-muted-foreground">{meta}</Text>}
                      {!!e.note && <Text className="mt-0.5 text-xs italic text-muted-foreground" numberOfLines={1}>{e.note}</Text>}
                    </View>
                    {navigable && <Caret size={16} color="hsl(0 0% 45%)" />}
                  </Pressable>
                )
              })}

              {/* Entreno planificado (si no hay sesiones registradas) */}
              {selectedEntries.length === 0 && selectedPlanned && (
                selectedPlanned.type === 'rest' ? (
                  <Text className="text-xs text-muted-foreground">{t('calendar.restDay')}</Text>
                ) : (
                  <View className="rounded-xl border border-border border-l-[3px] border-l-lime/50 bg-muted/20 px-4 py-3">
                    <View className="flex-row items-center gap-2">
                      <View className="rounded border border-lime/30 bg-lime/10 px-1.5 py-0.5">
                        <Text className="font-mono text-[9px] uppercase tracking-wide text-lime">{t('calendar.planned')}</Text>
                      </View>
                      {!!activeProgram && <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>{activeProgram.name}</Text>}
                    </View>
                    <Text className="mt-1 font-sans-medium text-foreground">{selectedPlanned.focus}</Text>
                    <Text className="mt-0.5 text-[10px] text-muted-foreground">{selectedPlanned.name} · {t('workout.phase')} {settings.phase || 1}</Text>
                  </View>
                )
              )}

              {/* Métricas de bienestar: nutrición · agua · sueño · peso · medidas · fotos · lumbar */}
              {(data.nutritionByDate[selectedDate] || data.waterByDate[selectedDate] || data.sleepByDate[selectedDate] || data.weightByDate[selectedDate] || data.measurementByDate[selectedDate] || data.photosByDate[selectedDate] || data.lumbarByDate[selectedDate]) && (
                <View className="flex-row flex-wrap gap-2 pt-1">
                  {data.nutritionByDate[selectedDate] && (
                    <Pressable onPress={() => router.push('/nutrition')} className={cn('flex-row items-center gap-2 rounded-lg border px-3 py-2 active:opacity-70', ACCENT.nutrition.chip)}>
                      <Utensils size={13} color={ACCENT.nutrition.icon} />
                      <Text className="font-mono text-[11px] text-foreground">
                        {t('calendar.mealLabel', { count: data.nutritionByDate[selectedDate].meals })} · {data.nutritionByDate[selectedDate].calories} kcal
                      </Text>
                    </Pressable>
                  )}
                  {data.waterByDate[selectedDate] && (
                    <View className={cn('flex-row items-center gap-2 rounded-lg border px-3 py-2', ACCENT.water.chip)}>
                      <Droplet size={13} color={ACCENT.water.icon} />
                      <Text className="font-mono text-[11px] text-foreground">{data.waterByDate[selectedDate].totalMl} ml</Text>
                    </View>
                  )}
                  {data.sleepByDate[selectedDate] && (
                    <View className={cn('flex-row items-center gap-2 rounded-lg border px-3 py-2', ACCENT.sleep.chip)}>
                      <Moon size={13} color={ACCENT.sleep.icon} />
                      <Text className="font-mono text-[11px] text-foreground">
                        {Math.floor((data.sleepByDate[selectedDate].duration_minutes || 0) / 60)}h {(data.sleepByDate[selectedDate].duration_minutes || 0) % 60}m
                      </Text>
                    </View>
                  )}
                  {data.weightByDate[selectedDate] && (
                    <View className={cn('flex-row items-center gap-2 rounded-lg border px-3 py-2', ACCENT.weight.chip)}>
                      <Scale size={13} color={ACCENT.weight.icon} />
                      <Text className="font-mono text-[11px] text-foreground">{data.weightByDate[selectedDate].weight_kg} kg</Text>
                    </View>
                  )}
                  {data.measurementByDate[selectedDate] && (
                    <View className={cn('flex-row items-center gap-2 rounded-lg border px-3 py-2', ACCENT.measurement.chip)}>
                      <Ruler size={13} color={ACCENT.measurement.icon} />
                      <Text className="font-mono text-[11px] capitalize text-foreground">{t('calendar.measurementLabel')}</Text>
                    </View>
                  )}
                  {data.photosByDate[selectedDate] && (
                    <View className={cn('flex-row items-center gap-2 rounded-lg border px-3 py-2', ACCENT.photo.chip)}>
                      <Camera size={13} color={ACCENT.photo.icon} />
                      <Text className="font-mono text-[11px] text-foreground">{t('calendar.photoLabel', { count: data.photosByDate[selectedDate].count })}</Text>
                    </View>
                  )}
                  {data.lumbarByDate[selectedDate] && (
                    <View className={cn('flex-row items-center gap-2 rounded-lg border px-3 py-2', ACCENT.lumbar.chip)}>
                      <ShieldCheck size={13} color={ACCENT.lumbar.icon} />
                      <Text className="font-mono text-[11px] capitalize text-foreground">{t('calendar.lumbarLabel')} {data.lumbarByDate[selectedDate].lumbar_score}/5</Text>
                    </View>
                  )}
                </View>
              )}
            </CardContent>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
