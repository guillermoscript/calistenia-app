/**
 * Programas de comunidad (#353) — listado y descubrimiento.
 *
 * OJO: no son los programas de entrenamiento de `(tabs)/programs`. Aquí se
 * listan cohortes con hitos semanales; la ruta lleva `community-` para que no
 * choque con `program/[id].tsx`.
 */
import { useCallback, useState } from 'react'
import { View, FlatList, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X, CalendarCheck } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { EmptyState } from '@/components/ui/empty-state'
import { Loader } from '@/components/ui/loader'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import {
  useCommunityPrograms,
  type CommunityProgramCard,
} from '@calistenia/core/hooks/useCommunityPrograms'

export default function CommunityProgramsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { programs, loading, join } = useCommunityPrograms(userId)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  const openProgram = useCallback(
    (programId: string) => router.push(`/community-programs/${programId}`),
    [router],
  )

  const handleJoin = useCallback(async (programId: string) => {
    setJoiningId(programId)
    try {
      await join(programId, 'community_program_list')
      router.push(`/community-programs/${programId}`)
    } catch {
      Alert.alert(t('communityProgram.joinError'))
    } finally {
      setJoiningId(null)
    }
  }, [join, router, t])

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-start justify-between px-4 pb-4 pt-2">
        <View>
          <Kicker>
            {t('communityProgram.kicker')}
          </Kicker>
          <Text className="font-bebas text-4xl leading-none text-foreground">
            {t('communityProgram.title')}
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-muted/60 p-2 active:opacity-70"
        >
          <X size={18} color="#888899" />
        </Pressable>
      </View>

      <Text className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
        {t('communityProgram.subtitle')}
      </Text>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <Loader />
        </View>
      ) : (
        <FlatList
          data={programs}
          keyExtractor={keyExtractor}
          contentContainerClassName="px-4 pb-10 gap-2"
          ListEmptyComponent={
            <EmptyState
              icon={CalendarCheck}
              title={t('communityProgram.title')}
              body={t('communityProgram.empty')}
            />
          }
          renderItem={({ item }) => (
            <ProgramCard
              program={item}
              joining={joiningId === item.id}
              onOpen={openProgram}
              onJoin={handleJoin}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

const keyExtractor = (item: CommunityProgramCard) => item.id

function ProgramCard({
  program,
  joining,
  onOpen,
  onJoin,
}: {
  program: CommunityProgramCard
  joining: boolean
  onOpen: (programId: string) => void
  onJoin: (programId: string) => void
}) {
  const { t } = useTranslation()
  const status = program.membership?.status
  const isMember = status === 'active'
  const hasLeft = status === 'left'

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-sans-medium text-foreground">{t(program.title_key)}</Text>
          <Text className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t(program.description_key)}
          </Text>
        </View>
        {isMember ? (
          <View className="rounded border border-lime/30 bg-lime/10 px-2 py-1">
            <Kicker size="xs" tone="lime">
              {t('communityProgram.joined')}
            </Kicker>
          </View>
        ) : null}
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text className="font-mono text-[10px] text-lime">
          {t(`communityProgram.difficulty.${program.difficulty}`)}
        </Text>
        <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
        <Text className="font-mono text-[10px] text-muted-foreground">
          {t('communityProgram.durationDays', { count: program.duration_days })}
        </Text>
      </View>

      {hasLeft ? (
        <Text className="mt-2 text-[10px] text-amber-400">{t('communityProgram.leftNotice')}</Text>
      ) : null}

      <Pressable
        disabled={joining}
        onPress={() => (isMember ? onOpen(program.id) : onJoin(program.id))}
        className={cn(
          'mt-3 items-center rounded-lg px-3 py-2.5',
          joining ? 'bg-muted' : 'bg-lime/20 active:opacity-70',
        )}
      >
        <Text className="font-mono text-[11px] tracking-wide text-lime">
          {isMember
            ? t('challenge.preset.open')
            : hasLeft
              ? t('communityProgram.resume')
              : t('communityProgram.join')}
        </Text>
      </Pressable>
    </View>
  )
}
