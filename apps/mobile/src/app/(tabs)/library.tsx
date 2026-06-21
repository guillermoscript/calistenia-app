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

export default function LibraryScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const locale = i18n.language
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('todos')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOG.filter(ex => {
      if (category !== 'todos' && ex.category !== category) return false
      if (!q) return true
      return (
        localize(ex.name, locale).toLowerCase().includes(q) ||
        localize(ex.muscles, locale).toLowerCase().includes(q)
      )
    })
  }, [query, category, locale])

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
