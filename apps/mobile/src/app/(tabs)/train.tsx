/**
 * Pestaña Entrenar (#859, épica #852): todo lo que no es «el entreno de hoy».
 *
 * Sustituye a las pestañas Programas y Ejercicios y a la parte de entrenar del
 * menú ☰. De arriba abajo:
 * - Programa activo, fase y semana, con «Cambiar».
 * - Esta semana: los 7 días. Hoy lleva a la pestaña Hoy, que es donde se
 *   arranca; el resto abre la pauta del día (`/program-day`).
 * - Otras formas de entrenar: sesión libre, cardio con GPS y circuito.
 * - Explorar: Programas y Ejercicios, ahora pantallas de pila.
 *
 * La semana es la de calendario y cuenta días distintos con cualquier
 * entreno (`getWeekSummary`, #853), la misma que el inicio y Progreso.
 */
import { useMemo, type ComponentType } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, Plus, Activity, Timer } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useCardioSessions } from '@calistenia/core/hooks/useCardioStats'
import { todayStr, utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { activityDaysFromProgress, getWeekSummary, type WeekCell } from '@calistenia/core/lib/weekSummary'
import { calculateWorkoutDuration } from '@calistenia/core/lib/duration'

const MUTED = 'hsl(0 0% 55%)'

type IconType = ComponentType<{ size?: number; color?: string }>

export default function TrainScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { colorScheme } = useColorScheme()
  const lime = colorScheme === 'dark' ? 'hsl(74 90% 57%)' : 'hsl(74 90% 32%)'
  const { activeProgram, weekDays, phases, programProgress, progress, programsReady } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  // Misma query key que Hoy y Progreso: no hay fetch extra.
  const { sessions: cardioSessions } = useCardioSessions(user?.id ?? null)

  const today = todayStr()
  const phase = programProgress.currentPhase || 1
  const phaseMeta = phases.find(p => p.id === phase)

  const week = useMemo(
    () => getWeekSummary({
      today,
      activityDays: [
        ...activityDaysFromProgress(progress),
        ...cardioSessions.map(c => utcToLocalDateStr(c.started_at)),
      ],
      weekDays: activeProgram ? weekDays : [],
    }),
    [today, progress, cardioSessions, activeProgram, weekDays],
  )

  const totalWeeks = programProgress.totalWeeks
  const currentWeek = programProgress.currentWeek
  const weekPct = currentWeek && totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / totalWeeks) * 100)) : 0

  const openDay = (cell: WeekCell) => {
    haptics.light()
    // Hoy se arranca desde Hoy: ahí vive el botón de empezar y la lógica de
    // cardio, circuito y sesión en curso.
    if (cell.isToday) router.navigate('/(tabs)')
    else if (activeProgram) {
      router.push({ pathname: '/program-day', params: { id: activeProgram.id, phase: String(phase), day: cell.dayId } })
    }
  }

  const go = (href: Href) => {
    haptics.light()
    router.push(href)
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="gap-6 px-4 pb-10 pt-2">
        {/* Programa activo */}
        <View className="gap-3">
          <View className="flex-row items-end gap-2">
            <View className="flex-1 gap-0.5">
              <Kicker>{t('train.kicker')}</Kicker>
              <Text className="font-bebas text-[34px] leading-none text-foreground" numberOfLines={2}>
                {activeProgram ? activeProgram.name : t('train.noProgramTitle')}
              </Text>
            </View>
            {activeProgram ? (
              <Pressable
                onPress={() => go('/programs')}
                className="h-11 justify-center rounded-[10px] border border-border px-3.5 active:bg-muted/40"
                accessibilityRole="button"
                accessibilityLabel={t('train.changeProgram')}
              >
                <Text className="font-sans-medium text-[13px] text-foreground">{t('train.change')}</Text>
              </Pressable>
            ) : null}
            <ProfileAvatarButton />
          </View>

          {!programsReady ? (
            <View className="h-4 w-48 rounded bg-muted/60" />
          ) : activeProgram ? (
            <View className="gap-1.5">
              <View className="flex-row justify-between gap-3">
                <Kicker className="shrink tracking-[1px]" numberOfLines={1}>
                  {phases.length > 0
                    ? t('train.phaseOf', { phase, total: phases.length })
                    : t('profile.phase', { phase })}
                  {phaseMeta?.name ? ` · ${phaseMeta.name}` : ''}
                </Kicker>
                {currentWeek && totalWeeks > 0 ? (
                  <Kicker className="shrink-0 tracking-[1px]">
                    {t('profile.weekOfTotal', { current: currentWeek, total: totalWeeks })}
                  </Kicker>
                ) : null}
              </View>
              <View className="h-1 overflow-hidden rounded-full bg-muted">
                <View className="h-1 rounded-full bg-foreground" style={{ width: `${weekPct}%` }} />
              </View>
            </View>
          ) : (
            <View className="gap-3">
              <Text className="text-sm text-muted-foreground">{t('train.noProgramBody')}</Text>
              <Pressable
                onPress={() => go('/programs')}
                className="h-12 items-center justify-center rounded-xl bg-primary active:opacity-90"
                accessibilityRole="button"
              >
                <Text className="font-sans-medium text-primary-foreground">{t('train.chooseProgram')}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Esta semana */}
        {activeProgram && weekDays.length > 0 ? (
          <View className="gap-2">
            <View className="flex-row items-baseline justify-between">
              <Kicker>{t('train.thisWeek')}</Kicker>
              <Kicker className="tracking-[1px]">
                {t('train.doneOf', { done: week.done, planned: week.planned })}
              </Kicker>
            </View>
            <View className="border-t border-border">
              {week.cells.map(cell => {
                const day = weekDays.find(d => d.id === cell.dayId)
                const isRest = !day || day.type === 'rest'
                const workout = isRest ? null : getWorkout(phase, cell.dayId)
                const title = isRest ? t('train.rest') : workout?.title || day?.focus || day?.name || ''
                const minutes = workout && day?.type !== 'cardio' && day?.type !== 'circuit'
                  ? calculateWorkoutDuration(workout.exercises)
                  : 0
                const done = cell.state === 'done'
                // Un día de cardio no tiene pauta que ver: solo se abre hoy.
                const pressable = !isRest && (cell.isToday || day?.type !== 'cardio')
                const dayLabel = t(`day.${cell.dayId}`).slice(0, 3)
                const detail = cell.isToday
                  ? [t('common.today'), minutes > 0 ? t('train.minutes', { count: minutes }) : ''].filter(Boolean).join(' · ')
                  : minutes > 0 ? t('train.minutes', { count: minutes }) : ''

                return (
                  <Pressable
                    key={cell.day}
                    onPress={() => openDay(cell)}
                    disabled={!pressable}
                    accessibilityRole={pressable ? 'button' : undefined}
                    accessibilityLabel={`${t(`day.${cell.dayId}`)}: ${title}${done ? `, ${t('train.done')}` : ''}`}
                    className={cn(
                      'flex-row items-center gap-3 border-b border-border',
                      cell.isToday ? 'h-[52px]' : 'h-12',
                      pressable && 'active:bg-muted/40',
                    )}
                  >
                    <Text
                      className={cn(
                        'w-8 font-mono text-[10px] uppercase tracking-[1px]',
                        cell.isToday ? 'text-lime' : 'text-muted-foreground',
                      )}
                    >
                      {dayLabel}
                    </Text>
                    <Text
                      className={cn(
                        'flex-1',
                        cell.isToday ? 'font-sans-medium text-[15px] text-foreground'
                        : isRest ? 'text-sm text-muted-foreground/70'
                        : done ? 'text-sm text-muted-foreground'
                        : 'text-sm text-foreground',
                      )}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    {done ? (
                      <Check size={16} color={lime} strokeWidth={2.5} />
                    ) : detail ? (
                      <Text
                        className={cn(
                          'font-mono text-[10px] uppercase tracking-[1px]',
                          cell.isToday ? 'text-lime' : 'text-muted-foreground',
                        )}
                      >
                        {detail}
                      </Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        {/* Otras formas de entrenar */}
        <View className="gap-2">
          <Kicker>{t('train.otherWays')}</Kicker>
          <View className="border-t border-border">
            <WayRow icon={Plus} lime={lime} title={t('train.freeTitle')} sub={t('train.freeSub')} onPress={() => go('/free-session')} />
            <WayRow icon={Activity} lime={lime} title={t('train.cardioTitle')} sub={t('train.cardioSub')} onPress={() => go('/cardio')} />
            <WayRow
              icon={Timer}
              lime={lime}
              title={t('train.circuitTitle')}
              sub={t('train.circuitSub')}
              onPress={() => go({ pathname: '/free-session', params: { mode: 'circuit' } })}
            />
          </View>
        </View>

        {/* Explorar */}
        <View className="gap-2">
          <Kicker>{t('train.explore')}</Kicker>
          <View className="flex-row gap-2.5">
            <ExploreCard title={t('nav.programs')} sub={t('train.programsSub')} onPress={() => go('/programs')} />
            <ExploreCard title={t('nav.exercises')} sub={t('train.exercisesSub')} onPress={() => go('/library')} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function WayRow({ icon: Icon, lime, title, sub, onPress }: {
  icon: IconType
  lime: string
  title: string
  sub: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 border-b border-border py-2 active:bg-muted/40"
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View className="size-8 items-center justify-center rounded-lg border border-border">
        <Icon size={16} color={lime} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-sans-medium text-sm text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{sub}</Text>
      </View>
      <ChevronRight size={16} color={MUTED} />
    </Pressable>
  )
}

function ExploreCard({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 gap-1 rounded-xl border border-border p-3.5 active:bg-muted/40"
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text className="font-bebas text-2xl leading-none text-foreground">{title}</Text>
      <Text className="text-xs text-muted-foreground">{sub}</Text>
    </Pressable>
  )
}
