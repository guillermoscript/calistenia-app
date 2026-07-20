import { memo, useCallback, useMemo, useState } from 'react'
import { View, FlatList, Pressable, ScrollView, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, BadgeCheck, Dumbbell, Plus, Search, X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { MenuButton } from '@/components/QuickMenu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useAuthUser } from '@/lib/use-auth-user'
import type { ProgramMeta, ProgramDifficulty } from '@calistenia/core/types'

const LIME = 'hsl(74 90% 45%)'
const DIFFICULTY_ORDER: ProgramDifficulty[] = ['beginner', 'intermediate', 'advanced']

type FilterKey = string // 'all' | 'official' | 'mine' | `diff:${ProgramDifficulty}` | `disc:${string}`

export default function ProgramsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { programs, activeProgram } = useWorkoutState()
  const { refreshPrograms } = useWorkoutActions()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [refreshing, setRefreshing] = useState(false)

  // Pull-to-refresh: invalida el catálogo y vuelve a pedirlo (escape manual si
  // el caché quedó vacío). refreshPrograms ignora la llamada si no hay userId.
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshPrograms()
    } finally {
      setRefreshing(false)
    }
  }, [refreshPrograms])

  // Chips de filtro derivados de los datos: solo mostramos lo que existe.
  // Un único "Todos" + facetas presentes (ámbito · dificultad · disciplina).
  const chips = useMemo(() => {
    const list: { key: FilterKey; label: string }[] = [
      { key: 'all', label: t('programs.scopeAll') },
      { key: 'official', label: t('programs.scopeOfficial') },
    ]
    if (userId && programs.some(p => p.created_by === userId)) {
      list.push({ key: 'mine', label: t('programs.scopeMine') })
    }
    DIFFICULTY_ORDER.filter(d => programs.some(p => p.difficulty === d)).forEach(d =>
      list.push({ key: `diff:${d}`, label: t(`difficulty.${d}`) }),
    )
    if (programs.some(p => p.discipline === 'calistenia') && programs.some(p => p.discipline === 'yoga')) {
      list.push({ key: 'disc:calistenia', label: t('programs.disciplineCalistenia') })
      list.push({ key: 'disc:yoga', label: t('programs.disciplineYoga') })
    }
    return list
  }, [programs, userId, t])

  const matchesFilter = (p: ProgramMeta): boolean => {
    if (filter === 'all') return true
    if (filter === 'official') return !!p.is_official
    if (filter === 'mine') return p.created_by === userId
    if (filter.startsWith('diff:')) return p.difficulty === filter.slice(5)
    if (filter.startsWith('disc:')) return p.discipline === filter.slice(5)
    return true
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const result = programs.filter(p => {
      if (!matchesFilter(p)) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false)
    })
    // Activo primero → destacados → oficiales → resto (orden estable como la web)
    return result.sort((a, b) => {
      if (a.id === activeProgram?.id) return -1
      if (b.id === activeProgram?.id) return 1
      if (!!a.is_featured !== !!b.is_featured) return a.is_featured ? -1 : 1
      if (!!a.is_official !== !!b.is_official) return a.is_official ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [programs, activeProgram?.id, userId, query, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const isFiltering = filter !== 'all' || query.trim() !== ''
  const clear = () => { setQuery(''); setFilter('all') }

  // Callback estable hoisteado a la raíz de la lista (list-performance-callbacks):
  // cada fila lo invoca con su id, evitando crear una nueva función por render.
  const openProgram = useCallback(
    (id: string) => router.push({ pathname: '/program/[id]', params: { id } }),
    [router],
  )
  const activeId = activeProgram?.id

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="gap-3 px-4 pb-3 pt-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-bebas text-4xl leading-none text-foreground">{t('programs.title')}</Text>
          <MenuButton />
        </View>

        {/* Búsqueda */}
        <InputGroup>
          <InputGroupAddon>
            <Search size={17} color="hsl(0 0% 50%)" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('programs.searchPlaceholder')}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <InputGroupAddon>
              <Pressable onPress={() => setQuery('')} hitSlop={8} className="p-1 active:opacity-60">
                <X size={16} color="hsl(0 0% 55%)" />
              </Pressable>
            </InputGroupAddon>
          )}
        </InputGroup>

        {/* Barra de filtros — una sola fila, selección única */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-4">
          {chips.map(c => {
            const active = filter === c.key
            return (
              <Pressable
                key={c.key}
                onPress={() => setFilter(c.key)}
                className={cn(
                  'rounded-full border px-3.5 py-2 active:opacity-70',
                  active ? 'border-lime/50 bg-lime/15' : 'border-border bg-card',
                )}
              >
                <Text
                  className={cn(
                    'font-mono text-[11px] uppercase tracking-wide',
                    active ? 'text-lime' : 'text-muted-foreground',
                  )}
                >
                  {c.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="px-4 pb-8 gap-2.5"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={LIME}
            colors={[LIME]}
          />
        }
        ListHeaderComponent={
          <View className="gap-2.5 pb-0.5">
            <Pressable
              onPress={() => router.push('/free-session')}
              className="flex-row items-center gap-3 rounded-xl border border-lime/40 bg-lime/5 px-4 py-3.5 active:opacity-70"
            >
              <View className="h-8 w-8 items-center justify-center rounded-full bg-lime/15">
                <Dumbbell size={16} color={LIME} />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">Sesión libre</Text>
                <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  Arma tu propio entreno
                </Text>
              </View>
              <ChevronRight size={18} color={LIME} />
            </Pressable>

            {/* Editor de programas nativo (#223) */}
            <Pressable
              onPress={() => router.push('/program-editor')}
              className="flex-row items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3.5 active:border-lime/50 active:opacity-80"
            >
              <View className="h-8 w-8 items-center justify-center rounded-full bg-muted/60">
                <Plus size={16} color="#888899" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-medium text-foreground">{t('programs.createOwn')}</Text>
                <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('programs.createOwnHint')}
                </Text>
              </View>
              <ChevronRight size={18} color="#888899" />
            </Pressable>

            <Text className="px-0.5 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground/70">
              {t('programs.resultsCount', { count: filtered.length })}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center gap-3 rounded-xl border border-dashed border-border py-14">
            <Text className="text-3xl">🔍</Text>
            <Text className="px-6 text-center font-bebas text-xl text-muted-foreground">
              {query.trim() ? t('programs.noSearchResults', { query: query.trim() }) : t('programs.noResults')}
            </Text>
            {isFiltering && (
              <Pressable onPress={clear} className="rounded-full border border-border px-4 py-2 active:opacity-70">
                <Text className="font-mono text-[10px] uppercase tracking-wide text-lime">{t('programs.clearFilters')}</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ProgramRow program={item} isActive={item.id === activeId} onOpen={openProgram} />
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

const ProgramRow = memo(function ProgramRow({ program, isActive, onOpen }: {
  program: ProgramMeta
  isActive: boolean
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  const handlePress = useCallback(() => onOpen(program.id), [onOpen, program.id])
  return (
    <Pressable
      onPress={handlePress}
      className={cn(
        'flex-row items-center gap-3 rounded-xl border bg-card px-4 py-3.5 active:opacity-70',
        isActive ? 'border-lime/40' : 'border-border',
      )}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text className="font-sans-medium text-foreground" numberOfLines={1}>{program.name}</Text>
          {program.is_official && <BadgeCheck size={14} color={LIME} />}
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
})
