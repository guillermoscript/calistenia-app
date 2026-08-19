/**
 * Detalle de un programa de comunidad (#353): semana actual, hitos semanales y
 * progreso total. Todo el progreso se recalcula al leer — no hay nada guardado.
 *
 * Coexiste con `community-programs.tsx` (listado en /community-programs), igual
 * que `challenges.tsx` + `challenges/[id].tsx`.
 */
import { useCallback, useState } from 'react'
import { View, ScrollView, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Loader } from '@/components/ui/loader'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import {
  useCommunityProgramDetail,
  useCommunityPrograms,
  type MilestoneChallengeLink,
} from '@calistenia/core/hooks/useCommunityPrograms'
import { useChallenges } from '@calistenia/core/hooks/useChallenges'
import {
  getMilestoneState,
  type CommunityProgramProgress,
  type MilestoneProgress,
  type MilestoneState,
} from '@calistenia/core/lib/community-programs'
import { formatDateRange, todayStr } from '@calistenia/core/lib/dateUtils'

/** Un color por estado; se decide una vez y lo comparten fila y etiqueta. */
const STATE_STYLES: Record<MilestoneState, { border: string; label: string; bar: string }> = {
  complete: { border: 'border-lime/40', label: 'text-lime', bar: 'bg-lime' },
  active: { border: 'border-border', label: 'text-amber-400', bar: 'bg-lime' },
  locked: { border: 'border-border/60', label: 'text-muted-foreground', bar: 'bg-muted-foreground/50' },
  missed: { border: 'border-border/60', label: 'text-muted-foreground', bar: 'bg-muted-foreground/50' },
  unavailable: { border: 'border-border/60', label: 'text-muted-foreground', bar: 'bg-muted-foreground/50' },
}

export default function CommunityProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const programId = id ?? ''
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { program, milestones, membership, progress, challengeLinks, loading, refetch } =
    useCommunityProgramDetail(programId, userId)
  const { join, leave } = useCommunityPrograms(userId)
  // Los hitos de tipo reto reutilizan la unión de presets (#350), idempotente y
  // a prueba de carreras; no se duplica la lógica aquí.
  const { joinPreset } = useChallenges(userId)
  const [busy, setBusy] = useState(false)

  const handleJoinChallenge = useCallback(async (presetKey: string) => {
    try {
      const result = await joinPreset(presetKey)
      await refetch()
      router.push(`/challenges/${result.challengeId}`)
    } catch {
      Alert.alert(t('communityProgram.joinError'))
    }
  }, [joinPreset, refetch, router, t])

  const handleJoin = useCallback(async () => {
    setBusy(true)
    try {
      await join(programId, 'community_program_detail')
    } catch {
      Alert.alert(t('communityProgram.joinError'))
    } finally {
      setBusy(false)
    }
  }, [join, programId, t])

  const handleLeave = useCallback(async () => {
    setBusy(true)
    try {
      await leave(programId, 'community_program_detail')
    } catch {
      Alert.alert(t('communityProgram.joinError'))
    } finally {
      setBusy(false)
    }
  }, [leave, programId, t])

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background" edges={['top']}>
        <Loader />
      </SafeAreaView>
    )
  }

  // Programa despublicado, borrado o id inventado: estado seguro.
  if (!program) {
    return (
      <SafeAreaView className="flex-1 bg-background px-4" edges={['top']}>
        <Text className="mt-10 text-center text-xs text-muted-foreground">
          {t('communityProgram.notFound')}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 items-center rounded-lg bg-lime/20 px-3 py-2.5 active:opacity-70"
        >
          <Text className="font-mono text-[11px] tracking-wide text-lime">{t('common.back')}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const isMember = membership?.status === 'active'
  const today = todayStr()

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-start justify-between px-4 pb-3 pt-2">
        <View className="flex-1 pr-3">
          <Kicker>
            {t('communityProgram.kicker')}
          </Kicker>
          <Text className="font-bebas text-4xl leading-none text-foreground">
            {t(program.title_key)}
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-muted/60 p-2 active:opacity-70"
        >
          <X size={18} color="#888899" />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-10 gap-3">
        <Text className="text-xs leading-relaxed text-muted-foreground">
          {t(program.description_key)}
        </Text>

        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text className="font-mono text-[10px] text-lime">
            {t(`communityProgram.difficulty.${program.difficulty}`)}
          </Text>
          <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
          <Text className="font-mono text-[10px] text-muted-foreground">
            {t('communityProgram.durationDays', { count: program.duration_days })}
          </Text>
          <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
          <Text className="font-mono text-[10px] text-muted-foreground">
            {t('communityProgram.milestoneCount', { count: milestones.length })}
          </Text>
        </View>

        {progress ? (
          <ProgressSummary progress={progress} />
        ) : (
          <View className="rounded-xl border border-border bg-card p-4">
            <Text className="text-xs text-muted-foreground">
              {membership?.status === 'left'
                ? t('communityProgram.leftNotice')
                : t('communityProgram.notJoined')}
            </Text>
          </View>
        )}

        {milestones.length === 0 ? (
          <Text className="rounded-xl border border-border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
            {t('communityProgram.emptyMilestones')}
          </Text>
        ) : progress ? (
          progress.milestones.map(item => (
            <MilestoneRow
              key={item.milestone.id}
              item={item}
              state={getMilestoneState(item, today)}
              link={challengeLinks[item.milestone.id]}
              onOpenChallenge={(challengeId) => router.push(`/challenges/${challengeId}`)}
              onJoinChallenge={handleJoinChallenge}
            />
          ))
        ) : (
          milestones.map(milestone => (
            <View key={milestone.id} className="rounded-xl border border-border/60 bg-card p-4">
              <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('communityProgram.currentWeek', { week: milestone.week })}
              </Text>
              <Text className="mt-1 text-sm font-sans-medium text-foreground">
                {t(milestone.title_key)}
              </Text>
              <Text className="mt-1 font-mono text-[10px] text-muted-foreground">
                {t('communityProgram.milestoneProgress', { done: 0, target: milestone.target })}
              </Text>
            </View>
          ))
        )}

        <Pressable
          disabled={busy}
          onPress={() => void (isMember ? handleLeave() : handleJoin())}
          className={cn(
            'mt-2 items-center rounded-lg px-3 py-2.5',
            isMember ? 'border border-border active:opacity-70' : 'bg-lime/20 active:opacity-70',
          )}
        >
          <Text
            className={cn(
              'font-mono text-[11px] tracking-wide',
              isMember ? 'text-muted-foreground' : 'text-lime',
            )}
          >
            {isMember
              ? t('communityProgram.leave')
              : membership?.status === 'left'
                ? t('communityProgram.resume')
                : t('communityProgram.join')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function ProgressSummary({ progress }: { progress: CommunityProgramProgress }) {
  const { t } = useTranslation()
  const totalWeeks = progress.milestones.length

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
          {t('communityProgram.overall')}
        </Text>
        <Text className="font-bebas text-3xl leading-none text-lime">{progress.percent}%</Text>
      </View>

      <View className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <View className="h-full rounded-full bg-lime" style={{ width: `${progress.percent}%` }} />
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text className="font-mono text-[10px] text-amber-400">
          {progress.currentWeek === null
            ? progress.isComplete
              ? t('communityProgram.completed')
              : t('communityProgram.finished')
            : progress.currentWeek > totalWeeks
              ? t('communityProgram.finalStretch')
              : t('communityProgram.weekOf', { week: progress.currentWeek, total: totalWeeks })}
        </Text>
        <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
        <Text className="font-mono text-[10px] text-muted-foreground">
          {t('communityProgram.daysRemaining', { count: progress.daysRemaining })}
        </Text>
      </View>

      {progress.nextMilestone ? (
        <Text className="mt-2 font-mono text-[10px] text-muted-foreground">
          {t('communityProgram.nextMilestone')}: {t(progress.nextMilestone.milestone.title_key)}
        </Text>
      ) : null}
    </View>
  )
}

function MilestoneRow({
  item,
  state,
  link,
  onOpenChallenge,
  onJoinChallenge,
}: {
  item: MilestoneProgress
  state: MilestoneState
  link?: MilestoneChallengeLink
  onOpenChallenge: (challengeId: string) => void
  onJoinChallenge: (presetKey: string) => void
}) {
  const { t } = useTranslation()
  const styles = STATE_STYLES[state]
  const percent = item.target > 0 ? Math.min(100, Math.round((item.completed / item.target) * 100)) : 0

  return (
    <View className={cn('rounded-xl border bg-card p-4', styles.border)}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {t('communityProgram.currentWeek', { week: item.milestone.week })}
          </Text>
          <Text className="mt-1 text-sm font-sans-medium text-foreground">
            {t(item.milestone.title_key)}
          </Text>
          {item.milestone.description_key ? (
            <Text className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t(item.milestone.description_key)}
            </Text>
          ) : null}
        </View>
        <Text className={cn('font-mono text-[9px] uppercase tracking-[2px]', styles.label)}>
          {milestoneStateLabel(state, item, t)}
        </Text>
      </View>

      {state === 'unavailable' ? null : (
        <View className="mt-2">
          <View className="h-1 overflow-hidden rounded-full bg-muted">
            <View className={cn('h-full rounded-full', styles.bar)} style={{ width: `${percent}%` }} />
          </View>
          <Text className="mt-1 font-mono text-[10px] text-muted-foreground">
            {t('communityProgram.milestoneProgress', { done: item.completed, target: item.target })}
          </Text>
        </View>
      )}

      {/*
        Hito de reto: si ya está unido se abre; si el preset existe pero aún no
        se ha unido, se ofrece unirse. Sin el segundo caso el hito enlazaba a un
        reto al que no había forma de entrar desde aquí.
      */}
      {link?.presetKnown && link.challengeId ? (
        <Pressable
          onPress={() => onOpenChallenge(link.challengeId!)}
          className="mt-2 active:opacity-70"
        >
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-lime">
            {t('communityProgram.openChallenge')}
          </Text>
        </Pressable>
      ) : link?.presetKnown && item.milestone.preset_key ? (
        <Pressable
          onPress={() => onJoinChallenge(item.milestone.preset_key!)}
          className="mt-2 active:opacity-70"
        >
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-lime">
            {t('communityProgram.joinChallenge')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/** Variantes explícitas por estado en vez de encadenar booleanos en el JSX. */
function milestoneStateLabel(
  state: MilestoneState,
  item: MilestoneProgress,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (state) {
    case 'complete':
      return t('communityProgram.milestoneComplete')
    case 'missed':
      return t('communityProgram.milestoneMissed')
    case 'unavailable':
      return t('communityProgram.milestoneUnavailable')
    case 'locked':
      return item.window
        ? t('communityProgram.milestoneLocked', {
            date: formatDateRange(item.window.startDay, item.window.endDay),
          })
        : t('communityProgram.notStarted')
    default:
      return t('communityProgram.currentWeek', { week: item.milestone.week })
  }
}
