/**
 * Picker de ejercicios del catálogo para el editor de programas (#223).
 * Port nativo de apps/web/src/components/ExerciseCatalogPicker.tsx (FlatList +
 * búsqueda; sin bloque wger en v1). Modal nativo (patrón CommentsSheet).
 *
 * Desde el #609 la lista sale de `useCatalogExerciseList()` de core en vez del
 * `CATALOG` estático: el bundle sigue siendo la respuesta inmediata y sin red
 * (el índice viene primado desde `init-core.ts`), y PB añade encima lo que sólo
 * existe allí — los ejercicios privados del usuario, los promovidos y el yoga,
 * que entró por migración y no viaja en el JSON empaquetado.
 */
import { useCallback, useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Plus, Search, X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { useCatalogExerciseList } from '@calistenia/core/hooks/useExerciseCatalog'
import { CATALOG_CATEGORIES, type CatalogExercise } from '@calistenia/core/lib/exerciseCatalog'
import type { EditorExercise } from '@calistenia/core/hooks/useProgramEditor'

const LIME = 'hsl(74 90% 45%)'

interface ExercisePickerSheetProps {
  visible: boolean
  onClose: () => void
  /** Añade el ejercicio al día activo; el sheet queda abierto para añadir más. */
  onAdd: (exercise: EditorExercise) => void
}

export function ExercisePickerSheet({ visible, onClose, onAdd }: ExercisePickerSheetProps) {
  const { t } = useTranslation()
  const l = useLocalize()
  const { exercises: catalog } = useCatalogExerciseList()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog
      .filter(ex => {
        if (category !== 'all' && ex.category !== category) return false
        if (!q) return true
        return (
          l(ex.name).toLowerCase().includes(q) ||
          l(ex.muscles).toLowerCase().includes(q)
        )
      })
      // Alfabético en el idioma que se está viendo, igual que el picker web:
      // antes esta lista salía en el orden del fichero (agrupada por categoría).
      .sort((a, b) => l(a.name).localeCompare(l(b.name)))
  }, [catalog, query, category, l])

  const handleAdd = useCallback((ex: CatalogExercise) => {
    haptics.light()
    onAdd({
      // `slug` y no `id`: la identidad canónica es la que viaja a `sets_log`, y
      // para un ejercicio venido de PB el `id` es aleatorio (#474).
      exerciseId: ex.slug,
      name: l(ex.name),
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.rest,
      muscles: l(ex.muscles),
      note: l(ex.note),
      youtube: ex.youtube,
      priority: ex.priority,
      isTimer: !!ex.isTimer,
      timerSeconds: ex.timerSeconds ?? 0,
    })
    setAddedIds(prev => new Set(prev).add(ex.slug))
  }, [onAdd, l])

  const handleClose = () => {
    setAddedIds(new Set())
    onClose()
  }

  const renderItem = useCallback(({ item: ex }: { item: CatalogExercise }) => {
    const added = addedIds.has(ex.slug)
    return (
      <Pressable
        onPress={() => handleAdd(ex)}
        className="flex-row items-center gap-3 border-b border-border/60 px-4 py-3 active:bg-lime/5"
      >
        <View className="flex-1 min-w-0">
          <Text className="font-sans-medium text-[13px] text-foreground" numberOfLines={1}>
            {l(ex.name)}
          </Text>
          <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground" numberOfLines={1}>
            {String(ex.sets)}×{ex.reps} · {l(ex.muscles)}
          </Text>
        </View>
        <View
          className={cn(
            'h-7 w-7 items-center justify-center rounded-full border',
            added ? 'border-lime bg-lime/20' : 'border-lime/40 bg-lime/10',
          )}
        >
          <Plus size={15} color={LIME} />
        </View>
      </Pressable>
    )
  }, [addedIds, handleAdd, l])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View className="flex-1 bg-background pt-14">
        {/* Header spec-sheet */}
        <View className="flex-row items-start justify-between px-4 pb-3">
          <View>
            <Kicker>
              {t('exercisePicker.catalogLabel')}
            </Kicker>
            <Text className="font-bebas text-3xl leading-none text-foreground">
              {t('exercisePicker.addExercise')}
            </Text>
          </View>
          <Pressable onPress={handleClose} className="rounded-full bg-muted/60 p-2 active:opacity-70" hitSlop={6}>
            <X size={18} color="#888899" />
          </Pressable>
        </View>

        {/* Búsqueda */}
        <View className="px-4 pb-2">
          <InputGroup>
            <InputGroupAddon>
              <Search size={17} color="hsl(0 0% 50%)" />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('exercisePicker.searchPlaceholder')}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <InputGroupAddon>
                <Pressable onPress={() => setQuery('')} hitSlop={8} className="p-1 active:opacity-60">
                  <X size={16} color="hsl(0 0% 55%)" />
                </Pressable>
              </InputGroupAddon>
            )}
          </InputGroup>
        </View>

        {/* Pills de categoría */}
        <View className="pb-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            {['all', ...CATALOG_CATEGORIES].map(cat => {
              const active = category === cat
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 active:opacity-70',
                    active ? 'border-lime/50 bg-lime/15' : 'border-border bg-card',
                  )}
                >
                  <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                    {cat === 'all' ? t('exerciseLibrary.allMuscles') : cat.replace(/_/g, ' ')}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={ex => ex.slug}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={16}
          contentContainerClassName="pb-10"
          ListEmptyComponent={
            <View className="items-center gap-2 py-14">
              <Text className="text-3xl">🔍</Text>
              <Text className="font-bebas text-xl text-muted-foreground">{t('exercisePicker.noResults')}</Text>
            </View>
          }
        />
      </View>
    </Modal>
  )
}
