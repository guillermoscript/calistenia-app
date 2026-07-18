import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCountUp } from '@/lib/use-count-up'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Play, Check, Moon, MapPin, Users, Bell, Trophy, Flag } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { RepeatTrainingButton } from '@/components/RepeatTrainingButton'
import { useAuthUser } from '@/lib/use-auth-user'
import { useNotifications } from '@calistenia/core/hooks/useNotifications'
import StreakMilestone from '@/components/StreakMilestone'
import HomeActivity from '@/components/home/HomeActivity'
import GettingStartedCard from '@/components/home/GettingStartedCard'
import InsightsCard from '@/components/insights/InsightsCard'
import WhatsNewModal from '@/components/WhatsNewModal'
import { MenuButton } from '@/components/QuickMenu'
import { NotificationBadge } from '@/components/social/NotificationBadge'
import { localDay, localHour, todayStr, diffDays } from '@calistenia/core/lib/dateUtils'
import type { DayId, WeekDay } from '@calistenia/core/types'

const DAY_IDS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const

/**
 * Días NO entrenables como sesión de fuerza en el MVP móvil. Igual que la web,
 * cualquier otro tipo (incluido day_type vacío en programas antiguos) es fuerza.
 */
const NON_STRENGTH_TYPES = new Set(['rest', 'cardio', 'yoga', 'circuit'])

const LIME = 'hsl(74 90% 45%)'

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
            <Text className={cn('font-mono text-[9px] uppercase tracking-[1px]', isToday ? 'text-lime' : 'text-muted-foreground')}>
              {t(`day.${day.id}`).slice(0, 3)}
            </Text>
            <View className="mt-1 h-4 items-center justify-center">
              {done ? (
                <Check size={14} color={LIME} />
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
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { settings, activeProgram, weekDays, phases, programsReady, cardioDayConfigs } = useWorkoutState()
  const { getWorkout, isWorkoutDone, getWeeklyDoneCount, getLongestStreak, getTotalSessions } = useWorkoutActions()
  const session = useActiveSession()
  const milestoneUser = useAuthUser()
  const { unreadCount, loadNotifications } = useNotifications(milestoneUser?.id ?? null)
  const [showMilestone, setShowMilestone] = useState(true)
  const scrollRef = useRef<ScrollView>(null)
  // «Completa tu primer entreno» del checklist: sube al hero (está justo encima).
  const scrollToHero = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), [])

  useEffect(() => {
    if (milestoneUser?.id) loadNotifications()
  }, [milestoneUser?.id, loadNotifications])

  const todayId = DAY_IDS[localDay()]
  const phase = settings.phase || 1
  const todayMeta = weekDays.find(d => d.id === todayId)
  const workout = useMemo(() => getWorkout(phase, todayId), [getWorkout, phase, todayId])
  const workoutKey = `p${phase}_${todayId}`
  const doneToday = isWorkoutDone(workoutKey)

  const hour = localHour()
  const greeting = hour < 12 ? t('dashboard.greeting.morning') : hour < 19 ? t('dashboard.greeting.afternoon') : t('dashboard.greeting.evening')
  const phaseMeta = phases.find(p => p.id === phase)

  const todayFormatted = new Date().toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const totalWeeks = activeProgram?.duration_weeks || 26
  const daysElapsed = settings.startDate ? diffDays(todayStr(), settings.startDate) : 0
  const weekElapsed = Math.min(Math.floor(daysElapsed / 7) + 1, totalWeeks)

  const isStrengthDay = !!todayMeta && !NON_STRENGTH_TYPES.has(todayMeta.type)
  const canTrainToday = isStrengthDay && !!workout && workout.exercises.length > 0
  const isResume = session.isActive && session.workoutKey === workoutKey

  // Día de cardio del programa: la card abre /cardio con los targets configurados
  const isCardioDay = todayMeta?.type === 'cardio'
  const cardioConfig = cardioDayConfigs[workoutKey]
  const handleStartCardio = () => {
    router.push({
      pathname: '/cardio',
      params: {
        ...(activeProgram ? { program: activeProgram.id, dayKey: workoutKey } : {}),
        ...(cardioConfig?.activityType ? { activity: cardioConfig.activityType } : {}),
        ...(cardioConfig?.targetDistanceKm ? { targetKm: String(cardioConfig.targetDistanceKm) } : {}),
        ...(cardioConfig?.targetDurationMin ? { targetMin: String(cardioConfig.targetDurationMin) } : {}),
      },
    })
  }

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

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerClassName="px-4 pb-8 gap-4">
        {/* ── Welcome header — mismo patrón que DashboardPage web ── */}
        <View className="flex-row items-start justify-between pt-2">
          <View className="flex-1">
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {todayFormatted}
            </Text>
            <Text className="mt-1 font-bebas text-[40px] leading-none text-foreground">{greeting}</Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              {t('common.week')} <Text className="text-sm font-sans-bold text-foreground">{weekElapsed}</Text> {t('common.of')} {totalWeeks}
              {activeProgram ? <Text className="text-sm text-lime"> · {activeProgram.name}</Text> : null}
            </Text>
          </View>
          {/* Cabecera: solo la campana (con badge ambiental) + ☰. Comunidad ya
              está en el menú ☰ y en los pills de abajo — sin botón redundante. */}
          <View className="flex-row items-center gap-1.5 pt-1">
            <Pressable
              onPress={() => router.push('/notifications')}
              className="size-10 items-center justify-center rounded-full bg-card border border-border active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Notificaciones"
            >
              <Bell size={18} color="hsl(0 0% 55%)" />
              <NotificationBadge count={unreadCount} />
            </Pressable>
            <MenuButton />
          </View>
        </View>

        {/* Plan semanal */}
        {activeProgram && weekDays.length > 0 && (
          <WeekStrip weekDays={weekDays} todayId={todayId} isDone={isWorkoutDone} phase={phase} />
        )}

        {/* ── Hero: workout de hoy — card clicable como la web ── */}
        {!programsReady ? (
          <Card><CardContent className="items-center py-10"><Text className="text-muted-foreground">{t('common.loading')}</Text></CardContent></Card>
        ) : !activeProgram ? (
          <Card>
            <CardContent className="items-center gap-3 py-8">
              <Text className="text-center font-bebas text-2xl text-foreground">{t('programs.chooseToStart')}</Text>
              <Button onPress={() => router.push('/programs')}>
                <Text>{t('nav.programs')}</Text>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Pressable
            onPress={canTrainToday && !doneToday ? handleStart : isCardioDay ? handleStartCardio : undefined}
            className={cn(
              'rounded-xl border-2 p-5',
              doneToday
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : canTrainToday
                  ? 'border-lime/30 bg-lime/5 active:scale-[0.99]'
                  : isCardioDay
                    ? 'border-emerald-400/30 bg-emerald-400/5 active:scale-[0.99]'
                    : 'border-border bg-card',
            )}
            accessibilityRole={(canTrainToday || isCardioDay) && !doneToday ? 'button' : undefined}
          >
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-1">
                <Text className="mb-1 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                  {todayMeta?.type === 'rest' ? t('dashboard.todayRest') : t('dashboard.todayWorkout')}
                </Text>
                <Text
                  className={cn(
                    'font-bebas text-3xl leading-none',
                    doneToday ? 'text-emerald-500' : canTrainToday ? 'text-lime' : isCardioDay ? 'text-emerald-400' : 'text-muted-foreground',
                  )}
                >
                  {doneToday
                    ? t('dashboard.completed')
                    : todayMeta?.type === 'rest'
                      ? t('dashboard.restDay')
                      : isCardioDay
                        ? `${t('cardio.title')} · ${t(`cardio.${cardioConfig?.activityType ?? 'running'}`)}`
                        : workout?.title || todayMeta?.focus || t('dashboard.train')}
                </Text>
                <Text className="mt-1.5 text-xs text-muted-foreground">
                  {activeProgram.name}{phaseMeta ? ` · ${t('workout.phaseLabel', { phase })}` : ''}
                  {canTrainToday && !doneToday ? ` · ${t('workout.exerciseCount', { count: workout!.exercises.length })}` : ''}
                </Text>
                {isResume && !doneToday && (
                  <Text className="mt-1 font-mono text-[10px] uppercase tracking-[2px] text-lime">
                    {t('warmupCooldown.transitions.continue')}
                  </Text>
                )}
              </View>

              {doneToday ? (
                <View className="size-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                  <Check size={22} color="#10b981" />
                </View>
              ) : todayMeta?.type === 'rest' ? (
                <Text className="text-3xl">😴</Text>
              ) : canTrainToday ? (
                <View className="size-12 shrink-0 items-center justify-center rounded-full bg-lime/10">
                  <Play size={22} color={LIME} fill={LIME} />
                </View>
              ) : isCardioDay ? (
                <View className="size-12 shrink-0 items-center justify-center rounded-full bg-emerald-400/10">
                  <MapPin size={22} color="#34d399" />
                </View>
              ) : null}
            </View>

            {/* Ya entrenaste hoy → permitir repetir (paridad con "REPETIR" de la web) */}
            {doneToday && canTrainToday && (
              <View className="mt-4">
                <RepeatTrainingButton tone="primary" onPress={handleStart} />
              </View>
            )}

            {isCardioDay && !doneToday && (cardioConfig?.targetDistanceKm || cardioConfig?.targetDurationMin) && (
              <Text className="mt-3 font-mono text-[10px] uppercase tracking-[2px] text-emerald-400">
                {[
                  cardioConfig?.targetDistanceKm ? t('cardio.targetKm', { km: cardioConfig.targetDistanceKm }) : null,
                  cardioConfig?.targetDurationMin ? t('cardio.targetMin', { min: cardioConfig.targetDurationMin }) : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            )}

            {!doneToday && !canTrainToday && !isCardioDay && todayMeta?.type !== 'rest' && (
              <Text className="mt-3 text-sm text-muted-foreground">
                {todayMeta?.focus} — {t('programs.contentComingSoon')}
              </Text>
            )}
          </Pressable>
        )}

        {/* Checklist «Primeros pasos» — activación de usuarios nuevos (#233).
            Arriba para quien empieza, sin tapar el hero. */}
        <GettingStartedCard
          userId={milestoneUser?.id ?? null}
          hasActiveProgram={!!activeProgram}
          totalSessions={getTotalSessions()}
          programsReady={programsReady}
          onWorkoutTap={scrollToHero}
        />

        {/* Otro día: entrena el que quieras — siempre disponible, aunque hoy
            tenga (o ya hayas hecho) su propio entrenamiento. */}
        {activeProgram && (
          <OtherDays phase={phase} todayId={todayId} weekDays={weekDays} />
        )}

        {/* Acceso directo a cardio GPS (también fuera de días de cardio del programa) */}
        {!isCardioDay && (
          <Pressable
            onPress={() => router.push('/cardio')}
            className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
          >
            <View className="flex-row items-center gap-3">
              <View className="size-9 items-center justify-center rounded-full bg-emerald-400/10">
                <MapPin size={16} color="#34d399" />
              </View>
              <View>
                <Text className="font-sans-medium text-foreground">{t('cardio.title')}</Text>
                <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('cardio.gpsTracking')}
                </Text>
              </View>
            </View>
            <Play size={16} color="hsl(0 0% 55%)" />
          </Pressable>
        )}

        {/* Stats */}
        <View className="flex-row gap-3">
          <StatCard label={t('common.week')} value={`${getWeeklyDoneCount()}/${settings.weeklyGoal || 5}`} />
          <StatCard label={t('profile.streak', { defaultValue: 'Racha' })} value={getLongestStreak()} />
          <StatCard label={t('profile.sessions', { defaultValue: 'Sesiones' })} value={getTotalSessions()} />
        </View>

        {/* Accesos rápidos comunidad */}
        <View className="flex-row gap-2">
          <CommunityPill icon={<Users size={15} color="hsl(0 0% 55%)" />} label="Amigos" onPress={() => router.push('/friends')} />
          <CommunityPill icon={<Trophy size={15} color="hsl(0 0% 55%)" />} label="Ranking" onPress={() => router.push('/leaderboard')} />
          <CommunityPill icon={<Flag size={15} color="hsl(0 0% 55%)" />} label="Retos" onPress={() => router.push('/challenges')} />
        </View>

        <InsightsCard userId={milestoneUser?.id ?? null} />

        {/* Actividad reciente — amigos / tú */}
        <HomeActivity />

        <Text className="text-center font-mono text-[9px] tracking-[2px] text-muted-foreground/50">{todayStr()}</Text>
      </ScrollView>

      {showMilestone && milestoneUser && getLongestStreak() > 0 && (
        <StreakMilestone
          streak={getLongestStreak()}
          userId={milestoneUser.id}
          userName={(milestoneUser.display_name as string) || (milestoneUser.name as string) || 'Atleta'}
          referralCode={(milestoneUser.referral_code as string) || null}
          onDismiss={() => setShowMilestone(false)}
        />
      )}

      {/* Novedades: se auto-muestra una vez al llegar a Home tras actualizar. */}
      <WhatsNewModal />
    </SafeAreaView>
  )
}

function CommunityPill({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 active:opacity-70"
    >
      {icon}
      <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">{label}</Text>
    </Pressable>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  const numeric = typeof value === 'number' ? value : null
  const count = useCountUp(numeric ?? 0)
  const display = numeric !== null ? String(count) : value
  return (
    <Card className="flex-1">
      <CardContent className="items-center py-4">
        <Text className="font-bebas text-2xl leading-none text-foreground">{display}</Text>
        <Text className="mt-1.5 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground" numberOfLines={1}>{label}</Text>
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
      <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('workout.chooseWorkout')}</Text>
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
              <Text className="font-sans-medium text-foreground">{w.title}</Text>
              <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {day.name} · {t('workout.exerciseCount', { count: w.exercises.length })}
              </Text>
            </View>
            {done ? <Check size={16} color={LIME} /> : <Play size={16} color="hsl(0 0% 55%)" />}
          </Pressable>
        )
      })}
    </View>
  )
}
