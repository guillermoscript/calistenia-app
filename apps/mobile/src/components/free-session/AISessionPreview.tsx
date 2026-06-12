/** Tarjeta de la sesión generada por la IA: resuelve los IDs contra el catálogo,
 *  agrupa por fase (warmup → main → cooldown), permite reordenar/quitar/agregar
 *  y arranca la sesión vía el engine (`startSession(..., 'free')`). */
import { useMemo, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { X, Plus } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { COLORS } from '@/lib/theme'
import { getCatalogExercise } from '@/lib/catalog'
import { aiExerciseToExercise, type AIExercise } from '@/lib/ai-exercise-to-exercise'
import { useExerciseSearch } from '@/lib/use-exercise-search'
import { useStartFreeSession } from '@/lib/start-free-session'
import { ReorderControls } from '@/components/free-session/ReorderControls'
import { localize } from '@calistenia/core/lib/i18n-db'

const PHASE_LABEL: Record<string, string> = {
  warmup: 'Calentamiento',
  main: 'Principal',
  cooldown: 'Vuelta a la calma',
}
const PHASE_COLOR: Record<string, string> = {
  warmup: 'text-amber-400',
  main: 'text-lime',
  cooldown: 'text-sky-400',
}

interface Props {
  exercises: AIExercise[]
  onRemove: (idx: number) => void
  onReorder: (fromIdx: number, toIdx: number) => void
  onAdd: (ex: AIExercise) => void
}

export function AISessionPreview({ exercises, onRemove, onReorder, onAdd }: Props) {
  const { i18n } = useTranslation()
  const locale = i18n.language || 'es'
  const startFreeSession = useStartFreeSession()
  const [starting, setStarting] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const resolved = useMemo(
    () =>
      exercises
        .map((ai) => aiExerciseToExercise(ai, locale))
        .filter((e): e is NonNullable<typeof e> => e !== null),
    [exercises, locale],
  )

  const excludeIds = useMemo(() => exercises.map((e) => e.id), [exercises])
  const searchResults = useExerciseSearch({ query, locale, excludeIds, minLength: 2, limit: 6 })

  function handleStart() {
    if (resolved.length === 0 || starting) return
    setStarting(true)
    startFreeSession(resolved, 'Sesión IA')
  }

  if (exercises.length === 0) return null

  return (
    <View className="overflow-hidden rounded-xl border border-lime/20 bg-card">
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-border bg-lime/5 px-4 py-2.5">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-lime">Tu sesión</Text>
        <Text className="font-mono text-[10px] text-muted-foreground">
          {resolved.length} ejercicios
          {resolved.length < exercises.length && (
            <Text className="font-mono text-[10px] text-amber-400">
              {`  (${exercises.length - resolved.length} no encontrados)`}
            </Text>
          )}
        </Text>
      </View>

      {/* Lista agrupada por fase */}
      <View className="px-2 py-2">
        {exercises.map((ai, idx) => {
          const cat = getCatalogExercise(ai.id)
          const name = cat ? localize(cat.name, locale) : ai.id
          const muscles = cat ? localize(cat.muscles, locale) : ''
          const phase = ai.phase || 'main'
          const prevPhase = idx > 0 ? exercises[idx - 1].phase || 'main' : null
          const showHeader = phase !== prevPhase

          return (
            <View key={`${ai.id}-${idx}`}>
              {showHeader && (
                <Text
                  className={cn(
                    'px-2 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[1.5px]',
                    PHASE_COLOR[phase],
                  )}
                >
                  {PHASE_LABEL[phase]}
                </Text>
              )}
              <View
                className={cn(
                  'flex-row items-center gap-2 rounded-lg px-2 py-2',
                  !cat && 'opacity-40',
                )}
              >
                <Text className="w-5 text-right font-mono text-[10px] text-muted-foreground">
                  {idx + 1}
                </Text>
                <View className="flex-1">
                  <Text className="font-sans-medium text-[13px] text-foreground" numberOfLines={1}>
                    {name}
                  </Text>
                  <View className="mt-0.5 flex-row items-center gap-1.5">
                    {!!muscles && (
                      <Text className="font-mono text-[10px] text-muted-foreground" numberOfLines={1}>
                        {muscles}
                      </Text>
                    )}
                    <Text className="font-mono text-[10px] text-muted-foreground">
                      {ai.sets}×{ai.reps} · {ai.rest}s
                    </Text>
                  </View>
                </View>
                <ReorderControls
                  index={idx}
                  count={exercises.length}
                  onMoveUp={() => onReorder(idx, idx - 1)}
                  onMoveDown={() => onReorder(idx, idx + 1)}
                  onRemove={() => onRemove(idx)}
                  size={15}
                  removeIcon="x"
                />
              </View>
            </View>
          )
        })}
      </View>

      {/* Agregar ejercicio */}
      <View className="border-t border-border px-3 py-2">
        {!searchOpen ? (
          <Pressable
            onPress={() => setSearchOpen(true)}
            className="flex-row items-center justify-center gap-1.5 py-1 active:opacity-70"
          >
            <Plus size={14} color={COLORS.mutedIcon} />
            <Text className="font-mono text-[11px] text-muted-foreground">Agregar ejercicio</Text>
          </Pressable>
        ) : (
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar ejercicio…"
                placeholderTextColor={COLORS.placeholder}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                className="h-10 flex-1 rounded-lg"
              />
              <Pressable
                onPress={() => {
                  setSearchOpen(false)
                  setQuery('')
                }}
                className="rounded-lg p-2 active:bg-muted/60"
              >
                <X size={16} color={COLORS.mutedIcon} />
              </Pressable>
            </View>
            {query.trim().length >= 2 && (
              <ScrollView className="max-h-44" keyboardShouldPersistTaps="handled">
                {searchResults.length === 0 ? (
                  <Text className="py-1 text-center font-mono text-[11px] text-muted-foreground">
                    Sin resultados
                  </Text>
                ) : (
                  searchResults.map((ex) => (
                    <Pressable
                      key={ex.id}
                      onPress={() => {
                        onAdd({
                          id: ex.id,
                          sets: Number(ex.sets) || 3,
                          reps: ex.reps || '8-12',
                          rest: ex.rest ?? 60,
                        })
                        setQuery('')
                        setSearchOpen(false)
                      }}
                      className="flex-row items-center gap-2 rounded-lg px-2 py-1.5 active:bg-accent/30"
                    >
                      <Plus size={14} color={COLORS.lime} />
                      <View className="flex-1">
                        <Text className="font-sans-medium text-[12px] text-foreground" numberOfLines={1}>
                          {localize(ex.name, locale)}
                        </Text>
                        <Text className="font-mono text-[10px] text-muted-foreground" numberOfLines={1}>
                          {localize(ex.muscles, locale)}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      {/* Empezar */}
      {resolved.length > 0 && (
        <View className="border-t border-border p-3">
          <Button onPress={handleStart} disabled={starting} className="w-full">
            <Text className="font-bebas text-lg tracking-wide">Empezar sesión</Text>
          </Button>
        </View>
      )}
    </View>
  )
}
