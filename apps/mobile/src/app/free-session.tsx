/** Sesión libre — picker de ejercicios del catálogo + warmup/cooldown prompt. */
import { useState, useMemo } from 'react'
import {
  View,
  FlatList,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X, Plus, RotateCcw, Trash2 } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { COLORS } from '@/lib/theme'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { CATALOG, CATALOG_CATEGORIES, type CatalogExercise } from '@/lib/catalog'
import { catalogToExercise } from '@/lib/catalog-to-exercise'
import { moveItem, removeAt } from '@/lib/reorder'
import { useExerciseSearch } from '@/lib/use-exercise-search'
import { useStartFreeSession } from '@/lib/start-free-session'
import { WarmupCooldownPrompt } from '@/components/free-session/WarmupCooldownPrompt'
import { ReorderControls } from '@/components/free-session/ReorderControls'
import { AISessionTab } from '@/components/free-session/AISessionTab'
import { useFreeSessionTemplates } from '@calistenia/core/hooks/useFreeSessionTemplates'
import { localize } from '@calistenia/core/lib/i18n-db'
import type { Exercise, FreeSessionTemplate } from '@calistenia/core/types'

export default function FreeSessionScreen() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const locale = i18n.language || 'es'
  const startFreeSession = useStartFreeSession()
  const authUser = useAuthUser()
  const { templates, useTemplate, deleteTemplate } = useFreeSessionTemplates(authUser?.id ?? null)

  // Re-lanzar una plantilla guardada: arranca la misma sesión al instante y
  // registra el uso en segundo plano (no bloquea la navegación).
  const relaunchTemplate = (tpl: FreeSessionTemplate) => {
    if (!tpl.exercises?.length) return
    haptics.medium()
    startFreeSession(tpl.exercises, tpl.title || 'Sesión libre')
    if (tpl.id) void useTemplate(tpl.id)
  }

  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [view, setView] = useState<'pick' | 'review'>('pick')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('todos')
  const [selected, setSelected] = useState<CatalogExercise[]>([])
  const [showPrompt, setShowPrompt] = useState(false)

  // ── Filtered catalog ───────────────────────────────────────────────────────

  const filtered = useExerciseSearch({
    query: search,
    locale,
    category: activeCategory === 'todos' ? undefined : activeCategory,
  })

  // ── Selection helpers ──────────────────────────────────────────────────────

  const selectedIds = useMemo(() => new Set(selected.map(e => e.id)), [selected])
  // Posición 1-based por id → evita un findIndex O(n) por fila en la lista de 307.
  const selectedPositions = useMemo(() => new Map(selected.map((e, i) => [e.id, i + 1])), [selected])

  function toggleExercise(ex: CatalogExercise) {
    setSelected(prev =>
      selectedIds.has(ex.id)
        ? prev.filter(e => e.id !== ex.id)
        : [...prev, ex],
    )
  }

  const moveUp = (index: number) => setSelected(prev => moveItem(prev, index, index - 1))
  const moveDown = (index: number) => setSelected(prev => moveItem(prev, index, index + 1))
  const removeSelected = (index: number) => setSelected(prev => removeAt(prev, index))

  // ── Session start ──────────────────────────────────────────────────────────

  function handleConfirm(warmup: Exercise[], cooldown: Exercise[]) {
    const main = selected.map(c => catalogToExercise(c, locale))
    startFreeSession([...warmup, ...main, ...cooldown], 'Sesión libre')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const title = mode === 'ai' ? 'Coach IA' : view === 'pick' ? 'Sesión libre' : 'Tu sesión'

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      {/* Custom header */}
      <View className="flex-row items-start justify-between px-4 pt-2 pb-3">
        <View className="flex-1">
          <Text className="font-bebas text-2xl leading-none text-foreground">{title}</Text>
          {mode === 'manual' && view === 'pick' && (
            <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {CATALOG.length} ejercicios disponibles
            </Text>
          )}
          {mode === 'manual' && view === 'review' && (
            <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {selected.length} seleccionados
            </Text>
          )}
        </View>
        <Pressable
          onPress={() =>
            mode === 'manual' && view === 'review' ? setView('pick') : router.back()
          }
          className="rounded-full bg-muted/60 p-2 active:opacity-70"
        >
          <X size={18} color={COLORS.mutedIcon} />
        </Pressable>
      </View>

      {/* Manual | IA segmented control */}
      <View className="mx-4 mb-3 flex-row rounded-xl bg-muted/40 p-1">
        {(['manual', 'ai'] as const).map(m => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            className={cn(
              'flex-1 items-center rounded-lg py-2 active:opacity-80',
              mode === m && 'bg-card',
            )}
          >
            <Text
              className={cn(
                'font-mono text-[11px] uppercase tracking-wide',
                mode === m ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {m === 'manual' ? 'Manual' : 'Coach IA'}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'ai' ? (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <AISessionTab />
        </KeyboardAvoidingView>
      ) : view === 'pick' ? (
        <PickView
          locale={locale}
          search={search}
          setSearch={setSearch}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          filtered={filtered}
          selectedIds={selectedIds}
          selected={selected}
          selectedPositions={selectedPositions}
          onToggle={toggleExercise}
          onContinue={() => setView('review')}
          templates={templates}
          onRelaunchTemplate={relaunchTemplate}
          onDeleteTemplate={deleteTemplate}
        />
      ) : (
        <ReviewView
          selected={selected}
          locale={locale}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
          onRemove={removeSelected}
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

// ── Saved templates (re-run a past free session) ────────────────────────────

function SavedTemplates({
  locale,
  templates,
  onRelaunch,
  onDelete,
}: {
  locale: string
  templates: FreeSessionTemplate[]
  onRelaunch: (tpl: FreeSessionTemplate) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()

  const confirmDelete = (tpl: FreeSessionTemplate) => {
    if (!tpl.id) return
    Alert.alert(t('freeSession.deleteTemplate'), tpl.title || '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('freeSession.delete'), style: 'destructive', onPress: () => onDelete(tpl.id!) },
    ])
  }

  return (
    <View className="mb-4">
      <Text className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
        {t('freeSession.savedTemplates')}
      </Text>
      <View className="gap-1.5">
        {templates.map(tpl => {
          const count = tpl.exercises.filter(e => !e.section || e.section === 'main').length
          return (
            <Pressable
              key={tpl.id}
              onPress={() => onRelaunch(tpl)}
              className="flex-row items-center gap-3 rounded-xl border border-lime/30 bg-lime/5 px-3 py-2.5 active:opacity-70"
            >
              <View className="h-7 w-7 items-center justify-center rounded-full bg-lime/15">
                <RotateCcw size={14} color={COLORS.lime} />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground" numberOfLines={1}>
                  {tpl.title || t('freeSession.freeSessionTitle')}
                </Text>
                <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('freeSession.exerciseCount', { count })}
                </Text>
              </View>
              <Pressable
                onPress={() => confirmDelete(tpl)}
                hitSlop={10}
                className="p-1.5 active:opacity-60"
                accessibilityLabel={t('freeSession.deleteTemplate')}
              >
                <Trash2 size={15} color={COLORS.mutedIcon} />
              </Pressable>
            </Pressable>
          )
        })}
      </View>
    </View>
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
  selectedPositions,
  onToggle,
  onContinue,
  templates,
  onRelaunchTemplate,
  onDeleteTemplate,
}: {
  locale: string
  search: string
  setSearch: (v: string) => void
  activeCategory: string
  setActiveCategory: (v: string) => void
  filtered: CatalogExercise[]
  selectedIds: Set<string>
  selected: CatalogExercise[]
  selectedPositions: Map<string, number>
  onToggle: (ex: CatalogExercise) => void
  onContinue: () => void
  templates: FreeSessionTemplate[]
  onRelaunchTemplate: (tpl: FreeSessionTemplate) => void
  onDeleteTemplate: (id: string) => void
}) {
  const categories = ['todos', ...CATALOG_CATEGORIES]
  // Las plantillas solo se muestran en la vista "limpia" (sin búsqueda ni
  // filtro) para no estorbar al buscar ejercicios.
  const showTemplates =
    templates.length > 0 && search.trim() === '' && activeCategory === 'todos'

  return (
    <View className="flex-1">
      {/* Search */}
      <View className="px-4 mb-3">
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar ejercicio…"
          placeholderTextColor={COLORS.placeholder}
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
        ListHeaderComponent={
          showTemplates ? (
            <SavedTemplates
              locale={locale}
              templates={templates}
              onRelaunch={onRelaunchTemplate}
              onDelete={onDeleteTemplate}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id)
          const position = selectedPositions.get(item.id) ?? null
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
                  <Plus size={14} color={COLORS.mutedIcon} />
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
            <ReorderControls
              index={index}
              count={selected.length}
              onMoveUp={() => onMoveUp(index)}
              onMoveDown={() => onMoveDown(index)}
              onRemove={() => onRemove(index)}
            />
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
