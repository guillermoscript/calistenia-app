import { View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, BadgeCheck, Dumbbell } from 'lucide-react-native'

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
      {/* Sesión libre entry card */}
      <Pressable
        onPress={() => router.push('/free-session')}
        className="mx-4 mb-3 flex-row items-center gap-3 rounded-xl border border-lime/40 bg-lime/5 px-4 py-3.5 active:opacity-70"
      >
        <View className="h-8 w-8 items-center justify-center rounded-full bg-lime/15">
          <Dumbbell size={16} color="hsl(74 90% 45%)" />
        </View>
        <View className="flex-1">
          <Text className="font-sans-medium text-foreground">Sesión libre</Text>
          <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            Arma tu propio entreno
          </Text>
        </View>
        <ChevronRight size={18} color="hsl(74 90% 45%)" />
      </Pressable>

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

// Estilos de badge por dificultad: fácil (azul) · medio (naranja) · difícil (rojo)
const DIFFICULTY_BADGE: Record<string, { box: string; text: string }> = {
  beginner: { box: 'bg-blue-500/15 border-blue-500/30', text: 'text-blue-300' },
  intermediate: { box: 'bg-orange-500/15 border-orange-500/30', text: 'text-orange-300' },
  advanced: { box: 'bg-red-500/15 border-red-500/30', text: 'text-red-300' },
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
            <View
              className={cn(
                'rounded-full border px-2 py-0.5',
                DIFFICULTY_BADGE[program.difficulty]?.box ?? 'border-border',
              )}
            >
              <Text
                className={cn(
                  'font-mono text-[9px] uppercase tracking-wide',
                  DIFFICULTY_BADGE[program.difficulty]?.text ?? 'text-muted-foreground',
                )}
              >
                {t(`difficulty.${program.difficulty}`)}
              </Text>
            </View>
          )}
        </View>
      </View>
      <ChevronRight size={18} color="hsl(0 0% 55%)" />
    </Pressable>
  )
}
