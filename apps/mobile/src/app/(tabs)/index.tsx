import { useMemo } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LogOut, Play, Check, Moon } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { logout } from '@calistenia/core/lib/pocketbase'
import { localDay, localHour, todayStr } from '@calistenia/core/lib/dateUtils'
import type { DayId, WeekDay } from '@calistenia/core/types'

const DAY_IDS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const

/**
 * Días NO entrenables como sesión de fuerza en el MVP móvil. Igual que la web,
 * cualquier otro tipo (incluido day_type vacío en programas antiguos) es fuerza.
 */
const NON_STRENGTH_TYPES = new Set(['rest', 'cardio', 'yoga', 'circuit'])

function WeekStrip({ weekDays, todayId, isDone, phase }: {
  weekDays: WeekDay[]
  todayId: DayId
  isDone: (key: string) => boolean
  phase: number
}) {
  const { t } = useTranslation()
  return (
    <View className="flex-row gap-1.5">
      {weekDays.map(day => {
        const isToday = day.id === todayId
        const done = isDone(`p${phase}_${day.id}`)
        return (
          <View
            key={day.id}
            className={cn(
              'flex-1 items-center rounded-lg border py-2',
              isToday ? 'border-lime/40 bg-lime/10' : 'border-border bg-card',
            )}
          >
            <Text className={cn('text-[10px] uppercase', isToday ? 'text-lime' : 'text-muted-foreground')}>
              {t(`day.${day.id}`)}
            </Text>
            <View className="mt-1 h-4 items-center justify-center">
              {done ? (
                <Check size={14} color="hsl(74 90% 45%)" />
              ) : day.type === 'rest' ? (
                <Moon size={12} color="#888899" />
              ) : (
                <View className="size-2 rounded-full" style={{ backgroundColor: day.color }} />
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}

export default function TodayScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { settings, activeProgram, weekDays, phases, programsReady } = useWorkoutState()
  const { getWorkout, isWorkoutDone, getWeeklyDoneCount, getLongestStreak, getTotalSessions } = useWorkoutActions()
  const session = useActiveSession()

  const todayId = DAY_IDS[localDay()]
  const phase = settings.phase || 1
  const todayMeta = weekDays.find(d => d.id === todayId)
  const workout = useMemo(() => getWorkout(phase, todayId), [getWorkout, phase, todayId])
  const workoutKey = `p${phase}_${todayId}`
  const doneToday = isWorkoutDone(workoutKey)

  const hour = localHour()
  const greeting = hour < 12 ? t('dashboard.greeting.morning') : hour < 19 ? t('dashboard.greeting.afternoon') : t('dashboard.greeting.evening')
  const phaseMeta = phases.find(p => p.id === phase)

  const isStrengthDay = !!todayMeta && !NON_STRENGTH_TYPES.has(todayMeta.type)
  const canTrainToday = isStrengthDay && !!workout && workout.exercises.length > 0

  const handleStart = () => {
    if (!workout) return
    // Si hay una sesión activa de este mismo workout, retomarla; si es de otro
    // día se descarta (mismo comportamiento que la web al empezar otra).
    if (!session.isActive || session.workoutKey !== workoutKey) {
      session.endSession()
      session.startSession(workout, workoutKey, 'program')
    }
    router.push('/session')
  }

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 pb-8 gap-4">
        {/* Header */}
        <View className="flex-row items-center justify-between pt-2">
          <View>
            <Text className="text-sm text-muted-foreground">{greeting}</Text>
            <Text className="text-xl font-bold text-foreground">
              {user?.display_name || user?.email || ''}
            </Text>
          </View>
          <Pressable onPress={handleLogout} hitSlop={8} accessibilityLabel={t('nav.signOut')} className="p-2">
            <LogOut size={18} color="hsl(0 0% 55%)" />
          </Pressable>
        </View>

        {/* Plan semanal */}
        {activeProgram && weekDays.length > 0 && (
          <WeekStrip weekDays={weekDays} todayId={todayId} isDone={isWorkoutDone} phase={phase} />
        )}

        {/* Hero: workout de hoy */}
        {!programsReady ? (
          <Card><CardContent className="py-10 items-center"><Text className="text-muted-foreground">{t('common.loading')}</Text></CardContent></Card>
        ) : !activeProgram ? (
          <Card>
            <CardContent className="items-center gap-3 py-8">
              <Text className="text-center text-base font-semibold text-foreground">{t('programs.chooseToStart')}</Text>
              <Button onPress={() => router.push('/programs')}>
                <Text>{t('nav.programs')}</Text>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className={cn(doneToday && 'border-lime/30')}>
            <CardContent className="gap-3 py-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {t('dashboard.todayWorkout')}
                </Text>
                {phaseMeta && (
                  <View className="rounded-full bg-muted px-2.5 py-0.5">
                    <Text className="text-[10px] text-muted-foreground">{t('workout.phaseLabel', { phase })}</Text>
                  </View>
                )}
              </View>

              <View>
                <Text className="text-2xl font-bold text-foreground">
                  {workout?.title || todayMeta?.focus || t('dashboard.restDay')}
                </Text>
                {todayMeta && (
                  <Text className="mt-0.5 text-sm text-muted-foreground">
                    {todayMeta.name} · {todayMeta.focus}
                  </Text>
                )}
                {canTrainToday && (
                  <Text className="mt-1 text-xs text-muted-foreground">
                    {t('workout.exerciseCount', { count: workout!.exercises.length })}
                  </Text>
                )}
              </View>

              {doneToday ? (
                <View className="flex-row items-center gap-2 rounded-lg bg-lime/10 px-4 py-3">
                  <Check size={16} color="hsl(74 90% 45%)" />
                  <Text className="font-semibold text-lime">{t('workout.completedToday')}</Text>
                </View>
              ) : canTrainToday ? (
                <Button size="lg" className="bg-lime active:bg-lime/90" onPress={handleStart}>
                  <View className="flex-row items-center gap-2">
                    <Play size={16} color="hsl(0 0% 8%)" fill="hsl(0 0% 8%)" />
                    <Text className="font-bold text-lime-foreground">
                      {session.isActive && session.workoutKey === workoutKey ? t('warmupCooldown.transitions.continue').toUpperCase() : t('dashboard.train')}
                    </Text>
                  </View>
                </Button>
              ) : todayMeta?.type === 'rest' ? (
                <View className="rounded-lg bg-muted/50 px-4 py-3">
                  <Text className="text-sm text-muted-foreground">{t('workout.restDayHint')}</Text>
                </View>
              ) : (
                <View className="rounded-lg bg-muted/50 px-4 py-3">
                  <Text className="text-sm text-muted-foreground">
                    {todayMeta?.focus} — {t('programs.contentComingSoon')}
                  </Text>
                </View>
              )}
            </CardContent>
          </Card>
        )}

        {/* Otro día: entrena el que quieras */}
        {activeProgram && !doneToday && !canTrainToday && (
          <OtherDays phase={phase} todayId={todayId} weekDays={weekDays} />
        )}

        {/* Stats */}
        <View className="flex-row gap-3">
          <StatCard label={t('common.week')} value={`${getWeeklyDoneCount()}/${settings.weeklyGoal || 5}`} />
          <StatCard label={t('profile.streak', { defaultValue: 'Racha' })} value={String(getLongestStreak())} />
          <StatCard label={t('profile.sessions', { defaultValue: 'Sesiones' })} value={String(getTotalSessions())} />
        </View>

        <Text className="text-center text-[10px] text-muted-foreground/50">{todayStr()}</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex-1">
      <CardContent className="items-center py-4">
        <Text className="text-xl font-bold text-foreground">{value}</Text>
        <Text className="mt-0.5 text-[11px] text-muted-foreground">{label}</Text>
      </CardContent>
    </Card>
  )
}

/** Lista de otros días entrenables de la semana (cuando hoy es descanso/cardio). */
function OtherDays({ phase, todayId, weekDays }: { phase: number; todayId: DayId; weekDays: WeekDay[] }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { getWorkout, isWorkoutDone } = useWorkoutActions()
  const session = useActiveSession()

  const trainable = weekDays.filter(d => d.id !== todayId && !NON_STRENGTH_TYPES.has(d.type))
  if (trainable.length === 0) return null

  return (
    <View className="gap-2">
      <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">{t('workout.chooseWorkout')}</Text>
      {trainable.map(day => {
        const w = getWorkout(phase, day.id)
        if (!w || w.exercises.length === 0) return null
        const key = `p${phase}_${day.id}`
        const done = isWorkoutDone(key)
        return (
          <Pressable
            key={day.id}
            onPress={() => {
              session.endSession()
              session.startSession(w, key, 'program')
              router.push('/session')
            }}
            className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
          >
            <View className="flex-1">
              <Text className="font-semibold text-foreground">{w.title}</Text>
              <Text className="text-xs text-muted-foreground">
                {day.name} · {t('workout.exerciseCount', { count: w.exercises.length })}
              </Text>
            </View>
            {done ? <Check size={16} color="hsl(74 90% 45%)" /> : <Play size={16} color="hsl(0 0% 55%)" />}
          </Pressable>
        )
      })}
    </View>
  )
}
