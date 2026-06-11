/** Sesión libre — picker de ejercicios del catálogo + warmup/cooldown prompt. */
import { useState, useMemo } from 'react'
import {
  View,
  FlatList,
  ScrollView,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X, Plus, ChevronUp, ChevronDown, Trash2 } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CATALOG, CATALOG_CATEGORIES, type CatalogExercise } from '@/lib/catalog'
import { catalogToExercise } from '@/lib/catalog-to-exercise'
import { WarmupCooldownPrompt } from '@/components/free-session/WarmupCooldownPrompt'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { localize } from '@calistenia/core/lib/i18n-db'
import type { Exercise, Workout } from '@calistenia/core/types'

export default function FreeSessionScreen() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const locale = i18n.language || 'es'
  const { startSession } = useActiveSession()

  const [view, setView] = useState<'pick' | 'review'>('pick')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('todos')
  const [selected, setSelected] = useState<CatalogExercise[]>([])
  const [showPrompt, setShowPrompt] = useState(false)

  // ── Filtered catalog ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return CATALOG.filter(ex => {
      const matchCat = activeCategory === 'todos' || ex.category === activeCategory
      const matchSearch = q === '' || localize(ex.name, locale).toLowerCase().includes(q)
      return matchCat && matchSearch
    })
  }, [search, activeCategory, locale])

  // ── Selection helpers ──────────────────────────────────────────────────────

  const selectedIds = useMemo(() => new Set(selected.map(e => e.id)), [selected])

  function toggleExercise(ex: CatalogExercise) {
    setSelected(prev =>
      selectedIds.has(ex.id)
        ? prev.filter(e => e.id !== ex.id)
        : [...prev, ex],
    )
  }

  function moveUp(index: number) {
    if (index === 0) return
    setSelected(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveDown(index: number) {
    setSelected(prev => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  function removeAt(index: number) {
    setSelected(prev => prev.filter((_, i) => i !== index))
  }

  // ── Session start ──────────────────────────────────────────────────────────

  function handleConfirm(warmup: Exercise[], cooldown: Exercise[]) {
    const main = selected.map(c => catalogToExercise(c, locale))
    const workout: Workout = {
      phase: 0,
      day: 'lun',
      title: 'Sesión libre',
      exercises: [...warmup, ...main, ...cooldown],
    }
    startSession(workout, `free_${Date.now()}`, 'free')
    router.replace('/session')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const title = view === 'pick' ? 'Sesión libre' : 'Tu sesión'

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      {/* Custom header */}
      <View className="flex-row items-start justify-between px-4 pt-2 pb-3">
        <View className="flex-1">
          <Text className="font-bebas text-2xl leading-none text-foreground">{title}</Text>
          {view === 'pick' && (
            <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {CATALOG.length} ejercicios disponibles
            </Text>
          )}
          {view === 'review' && (
            <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {selected.length} seleccionados
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => view === 'pick' ? router.back() : setView('pick')}
          className="rounded-full bg-muted/60 p-2 active:opacity-70"
        >
          <X size={18} color="#888899" />
        </Pressable>
      </View>

      {view === 'pick' ? (
        <PickView
          locale={locale}
          search={search}
          setSearch={setSearch}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          filtered={filtered}
          selectedIds={selectedIds}
          selected={selected}
          onToggle={toggleExercise}
          onContinue={() => setView('review')}
        />
      ) : (
        <ReviewView
          selected={selected}
          locale={locale}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
          onRemove={removeAt}
          onStart={() => setShowPrompt(true)}
        />
      )}

      {/* Warmup/cooldown prompt */}
      <WarmupCooldownPrompt
        mainExercises={selected.map(c => catalogToExercise(c, locale))}
        visible={showPrompt}
        onCancel={() => setShowPrompt(false)}
        onConfirm={handleConfirm}
      />
    </SafeAreaView>
  )
}

// ── Pick view ──────────────────────────────────────────────────────────────

function PickView({
  locale,
  search,
  setSearch,
  activeCategory,
  setActiveCategory,
  filtered,
  selectedIds,
  selected,
  onToggle,
  onContinue,
}: {
  locale: string
  search: string
  setSearch: (v: string) => void
  activeCategory: string
  setActiveCategory: (v: string) => void
  filtered: CatalogExercise[]
  selectedIds: Set<string>
  selected: CatalogExercise[]
  onToggle: (ex: CatalogExercise) => void
  onContinue: () => void
}) {
  const categories = ['todos', ...CATALOG_CATEGORIES]

  return (
    <View className="flex-1">
      {/* Search */}
      <View className="px-4 mb-3">
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar ejercicio…"
          placeholderTextColor="#71717a"
          className="h-11 rounded-xl"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 gap-2 pb-2"
        keyboardShouldPersistTaps="handled"
      >
        {categories.map(cat => (
          <Pressable
            key={cat}
            onPress={() => setActiveCategory(cat)}
            className={cn(
              'rounded-full border px-3 py-1 active:opacity-70',
              cat === activeCategory ? 'border-lime/40 bg-lime/10' : 'border-border bg-card',
            )}
          >
            <Text className={cn(
              'font-mono text-[10px] uppercase tracking-wide',
              cat === activeCategory ? 'text-lime' : 'text-muted-foreground',
            )}>
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Exercise list */}
      <FlatList
        data={filtered}
        keyExtractor={ex => ex.id}
        contentContainerClassName="px-4 pb-24 gap-1.5"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id)
          const position = isSelected ? selected.findIndex(e => e.id === item.id) + 1 : null
          return (
            <Pressable
              onPress={() => onToggle(item)}
              className={cn(
                'flex-row items-center gap-3 rounded-xl border px-3 py-2.5 active:opacity-70',
                isSelected ? 'border-lime/30 bg-lime/5' : 'border-border bg-card',
              )}
            >
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground" numberOfLines={1}>
                  {localize(item.name, locale)}
                </Text>
                <Text className="font-mono text-xs text-muted-foreground" numberOfLines={1}>
                  {localize(item.muscles, locale)}
                </Text>
              </View>
              <View className={cn(
                'h-7 w-7 items-center justify-center rounded-full border',
                isSelected ? 'border-lime bg-lime' : 'border-border bg-muted/40',
              )}>
                {isSelected ? (
                  <Text className="font-mono text-[11px] text-black">{position}</Text>
                ) : (
                  <Plus size={14} color="#888899" />
                )}
              </View>
            </Pressable>
          )
        }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-muted-foreground font-mono text-sm">Sin resultados</Text>
          </View>
        }
      />

      {/* Sticky bottom bar */}
      {selected.length > 0 && (
        <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-background/95 px-4 py-3">
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 font-mono text-[11px] text-muted-foreground">
              {selected.length} seleccionados
            </Text>
            <Button onPress={onContinue} size="sm" className="px-5">
              <Text className="font-bebas text-base tracking-wide">Continuar</Text>
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}

// ── Review view ────────────────────────────────────────────────────────────

function ReviewView({
  selected,
  locale,
  onMoveUp,
  onMoveDown,
  onRemove,
  onStart,
}: {
  selected: CatalogExercise[]
  locale: string
  onMoveUp: (i: number) => void
  onMoveDown: (i: number) => void
  onRemove: (i: number) => void
  onStart: () => void
}) {
  return (
    <View className="flex-1">
      <FlatList
        data={selected}
        keyExtractor={ex => ex.id}
        contentContainerClassName="px-4 pb-24 gap-2"
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="font-bebas text-xl text-muted-foreground">Sin ejercicios</Text>
            <Text className="mt-1 text-xs text-muted-foreground">Vuelve y selecciona algunos</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
            {/* Order number */}
            <Text className="font-mono text-[11px] text-muted-foreground w-5 text-center">{index + 1}</Text>
            {/* Name + muscles */}
            <View className="flex-1">
              <Text className="font-sans-medium text-foreground" numberOfLines={1}>
                {localize(item.name, locale)}
              </Text>
              <Text className="font-mono text-xs text-muted-foreground" numberOfLines={1}>
                {localize(item.muscles, locale)}
              </Text>
            </View>
            {/* Controls */}
            <View className="flex-row items-center gap-0.5">
              <Pressable
                onPress={() => onMoveUp(index)}
                disabled={index === 0}
                className={cn(
                  'rounded-lg p-1.5',
                  index === 0 ? 'opacity-30' : 'active:bg-muted/60',
                )}
              >
                <ChevronUp size={16} color="#888899" />
              </Pressable>
              <Pressable
                onPress={() => onMoveDown(index)}
                disabled={index === selected.length - 1}
                className={cn(
                  'rounded-lg p-1.5',
                  index === selected.length - 1 ? 'opacity-30' : 'active:bg-muted/60',
                )}
              >
                <ChevronDown size={16} color="#888899" />
              </Pressable>
              <Pressable
                onPress={() => onRemove(index)}
                className="rounded-lg p-1.5 active:bg-destructive/10"
              >
                <Trash2 size={16} color="#888899" />
              </Pressable>
            </View>
          </View>
        )}
      />

      {/* Start button */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-background/95 px-4 py-3">
        <Button
          onPress={onStart}
          disabled={selected.length === 0}
          className="w-full"
        >
          <Text className="font-bebas text-lg tracking-wide">Empezar</Text>
        </Button>
      </View>
    </View>
  )
}
