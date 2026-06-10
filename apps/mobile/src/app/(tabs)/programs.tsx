import { View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, BadgeCheck } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useWorkoutState } from '@/contexts/WorkoutContext'
import type { ProgramMeta } from '@calistenia/core/types'

export default function ProgramsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { programs, activeProgram, programsReady } = useWorkoutState()

  // Oficiales primero, igual que la web
  const sorted = [...programs].sort((a, b) => {
    if (a.id === activeProgram?.id) return -1
    if (b.id === activeProgram?.id) return 1
    return Number(b.is_official || false) - Number(a.is_official || false)
  })

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 pb-2 pt-2">
        <Text className="font-bebas text-4xl leading-none text-foreground">{t('programs.title')}</Text>
        <Text className="mt-1 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
          {t('programs.available', { count: programs.length })}
        </Text>
      </View>
      <FlatList
        data={sorted}
        keyExtractor={p => p.id}
        contentContainerClassName="px-4 pb-8 gap-2.5"
        ListEmptyComponent={
          <Text className="py-10 text-center text-muted-foreground">
            {programsReady ? t('programs.noResults') : t('common.loading')}
          </Text>
        }
        renderItem={({ item }) => (
          <ProgramRow
            program={item}
            isActive={item.id === activeProgram?.id}
            onPress={() => router.push({ pathname: '/program/[id]', params: { id: item.id } })}
          />
        )}
      />
    </SafeAreaView>
  )
}

function ProgramRow({ program, isActive, onPress }: {
  program: ProgramMeta
  isActive: boolean
  onPress: () => void
}) {
  const { t } = useTranslation()
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3 rounded-xl border bg-card px-4 py-3.5 active:opacity-70',
        isActive ? 'border-lime/40' : 'border-border',
      )}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text className="font-sans-medium text-foreground" numberOfLines={1}>{program.name}</Text>
          {program.is_official && <BadgeCheck size={14} color="hsl(74 90% 45%)" />}
        </View>
        <Text className="text-xs text-muted-foreground" numberOfLines={2}>
          {program.description}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          {isActive && (
            <View className="rounded-full bg-lime/15 px-2 py-0.5">
              <Text className="font-mono text-[9px] uppercase tracking-wide text-lime">{t('programs.activeBadge')}</Text>
            </View>
          )}
          <Text className="font-mono text-[10px] text-muted-foreground">
            {program.duration_weeks} {t('programs.weeks')}
          </Text>
          {program.difficulty && (
            <Text className="font-mono text-[10px] capitalize text-muted-foreground">· {program.difficulty}</Text>
          )}
        </View>
      </View>
      <ChevronRight size={18} color="hsl(0 0% 55%)" />
    </Pressable>
  )
}
