import { memo, useCallback, useMemo, useState } from 'react'
import { View, FlatList, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Input } from '@/components/ui/input'
import { MenuButton } from '@/components/QuickMenu'
import { cn } from '@/lib/utils'
import { CATALOG, CATALOG_CATEGORIES, type CatalogExercise } from '@/lib/catalog'
import { localize } from '@calistenia/core/lib/i18n-db'
import { EQUIPMENT_CATALOG, getEquipmentLabelKey, getExerciseEquipment } from '@calistenia/core/lib/equipment'
import { MUSCLE_GROUPS, getMuscleGroupLabelKey, getMuscleGroups } from '@calistenia/core/lib/muscles'
import type { DifficultyLevel } from '@calistenia/core/types'

const DIFFICULTIES: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced']

export default function LibraryScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const locale = i18n.language
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('todos')
  const [showFilters, setShowFilters] = useState(false)
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null)
  const [equipment, setEquipment] = useState<string | null>(null)
  const [muscle, setMuscle] = useState<string | null>(null)

  const activeCount = (difficulty ? 1 : 0) + (equipment ? 1 : 0) + (muscle ? 1 : 0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOG.filter(ex => {
      if (category !== 'todos' && ex.category !== category) return false
      if (difficulty && ex.difficulty !== difficulty) return false
      if (muscle && !getMuscleGroups(ex).includes(muscle)) return false
      if (equipment) {
        const ids = getExerciseEquipment({
          name: localize(ex.name, locale),
          note: localize(ex.note, locale),
          equipment: ex.equipment,
        })
        // 'ninguno' = solo peso corporal: sin ningún otro equipo
        if (equipment === 'ninguno') {
          if (!ids.every(id => id === 'ninguno')) return false
        } else if (!ids.includes(equipment)) return false
      }
      if (!q) return true
      return (
        localize(ex.name, locale).toLowerCase().includes(q) ||
        localize(ex.muscles, locale).toLowerCase().includes(q)
      )
    })
  }, [query, category, difficulty, equipment, muscle, locale])

  const openExercise = useCallback(
    (id: string) => router.push({ pathname: '/exercise/[id]', params: { id } }),
    [router],
  )
  const renderItem = useCallback(
    ({ item }: { item: CatalogExercise }) => (
      <ExerciseRow ex={item} locale={locale} onPress={openExercise} />
    ),
    [locale, openExercise],
  )

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="gap-3 px-4 pb-2 pt-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-bebas text-4xl leading-none text-foreground">{t('nav.exercises')}</Text>
          <MenuButton />
        </View>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={t('common.search')}
          className="h-11"
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {['todos', ...CATALOG_CATEGORIES].map(cat => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              className={cn(
                'rounded-full border px-3 py-1.5',
                category === cat ? 'border-lime/40 bg-lime/15' : 'border-border bg-card',
              )}
            >
              <Text className={cn('font-mono text-[10px] uppercase tracking-wide', category === cat ? 'text-lime' : 'text-muted-foreground')}>
                {cat === 'todos' ? t('common.filter') : cat.replace(/_/g, ' ')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Toggle: dificultad / equipo / músculo */}
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => setShowFilters(v => !v)} hitSlop={8} className="flex-row items-center gap-1.5">
            <Text className={cn('font-mono text-[10px] uppercase tracking-[2px]', activeCount > 0 ? 'text-lime' : 'text-muted-foreground/70')}>
              {showFilters ? '▾' : '▸'} {t('exerciseLibrary.equipmentAndMuscle')}
            </Text>
            {activeCount > 0 && (
              <View className="rounded border border-lime/20 bg-lime/10 px-1.5 py-0.5">
                <Text className="font-mono text-[9px] text-lime">{activeCount}</Text>
              </View>
            )}
          </Pressable>
          <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
            {t('exerciseLibrary.exerciseCount', { count: filtered.length })}
          </Text>
        </View>

        {showFilters && (
          <View className="gap-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {DIFFICULTIES.map(level => {
                const active = difficulty === level
                return (
                  <Pressable
                    key={level}
                    onPress={() => setDifficulty(active ? null : level)}
                    className={cn('rounded-full border px-3 py-1.5', active ? 'border-lime/40 bg-lime/15' : 'border-border bg-card')}
                  >
                    <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                      {t(`difficulty.${level}`)}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {EQUIPMENT_CATALOG.map(eq => {
                const active = equipment === eq.id
                return (
                  <Pressable
                    key={eq.id}
                    onPress={() => setEquipment(active ? null : eq.id)}
                    className={cn('rounded-full border px-3 py-1.5', active ? 'border-lime/40 bg-lime/15' : 'border-border bg-card')}
                  >
                    <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                      {eq.icon} {t(getEquipmentLabelKey(eq.id))}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {MUSCLE_GROUPS.map(mus => {
                const active = muscle === mus
                return (
                  <Pressable
                    key={mus}
                    onPress={() => setMuscle(active ? null : mus)}
                    className={cn('rounded-full border px-3 py-1.5', active ? 'border-lime/40 bg-lime/15' : 'border-border bg-card')}
                  >
                    <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                      {t(getMuscleGroupLabelKey(mus))}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={ex => ex.id}
        contentContainerClassName="px-4 pb-8 gap-2"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text className="py-10 text-center text-muted-foreground">{t('common.noResults')}</Text>}
        renderItem={renderItem}
      />
    </SafeAreaView>
  )
}

const ExerciseRow = memo(function ExerciseRow({ ex, locale, onPress }: { ex: CatalogExercise; locale: string; onPress: (id: string) => void }) {
  const handlePress = useCallback(() => onPress(ex.id), [onPress, ex.id])
  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
    >
      <View className="flex-1">
        <Text className="font-sans-medium text-foreground" numberOfLines={1}>{localize(ex.name, locale)}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>{localize(ex.muscles, locale)}</Text>
        <View className="mt-1 flex-row items-center gap-2">
          <Text className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">{ex.category.replace(/_/g, ' ')}</Text>
          {ex.difficulty && <Text className="font-mono text-[9px] capitalize text-muted-foreground/70">· {ex.difficulty}</Text>}
        </View>
      </View>
      <ChevronRight size={16} color="hsl(0 0% 55%)" />
    </Pressable>
  )
})
