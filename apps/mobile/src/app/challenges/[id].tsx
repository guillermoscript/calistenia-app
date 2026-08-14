/**
 * Detalle de un reto — progreso propio + clasificación + unirse. Puerto móvil de
 * ChallengeDetailPage (web), usando el mismo hook de core (`useChallengeDetail`).
 *
 * Ruta: /challenges/[id]. Coexiste con `challenges.tsx` (listado en /challenges)
 * igual que `cardio.tsx` + `cardio/[id].tsx` — no hace falta moverlo a
 * `challenges/index.tsx`.
 *
 * La pantalla tiene DOS layouts (#383), y quién decide es `getChallengeLayout`
 * en core para que web y nativo ramifiquen con el mismo criterio:
 *
 * - `goal` — compites contra un número: el progreso es el héroe y la
 *   clasificación baja a una sección plegada.
 * - `ranking` — compites contra personas: la clasificación es la pantalla, a
 *   sangre, con tu fila fijada abajo cuando se sale de la vista.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronDown } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/lib/use-auth-user'
import { useChallengeDetail } from '@calistenia/core/hooks/useChallengeDetail'
import { getMetricLabel, getMetricUnit, daysRemaining } from '@calistenia/core/lib/challenges'
import { getChallengeLayout, getGoalProgress } from '@calistenia/core/lib/challenge-layout'
import { formatDateRange } from '@calistenia/core/lib/dateUtils'
import {
  resolvePresetChallengeDescription,
  resolvePresetChallengeTitle,
} from '@calistenia/core/lib/challenge-presets'
import { pb } from '@calistenia/core/lib/pocketbase'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import type { LeaderboardEntry } from '@calistenia/core/hooks/useLeaderboard'

const LIME = 'hsl(74 90% 45%)'
const MEDALS = ['🥇', '🥈', '🥉']

/** Une valor y unidad sin dejar un espacio colgando cuando la métrica no tiene unidad. */
const withUnit = (value: number, unit: string) => (unit ? `${value} ${unit}` : `${value}`)

export default function ChallengeDetailScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const { challenge, leaderboard, loading, participantIds, load } = useChallengeDetail(id ?? null, userId)
  const [joining, setJoining] = useState(false)
  // La clasificación de la rama con meta nace plegada: el héroe es el progreso.
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)

  useEffect(() => { load() }, [load])

  const currentEntry = leaderboard.find(entry => entry.isCurrentUser) ?? null

  // Vista del detalle: una vez por reto cargado, no en cada refetch del leaderboard.
  const viewedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!id || loading || !challenge) return
    if (viewedIdRef.current === id) return
    viewedIdRef.current = id
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
      surface: 'challenge_detail',
      source: 'challenge_route',
      challenge_id: id,
      result: 'viewed',
    })
  }, [id, loading, challenge])

  // Progreso propio: se reemite cuando cambia el valor del usuario, no en cada render.
  const progressRef = useRef<string | null>(null)
  useEffect(() => {
    if (!id || loading || !currentEntry) return
    const key = `${id}:${currentEntry.value}`
    if (progressRef.current === key) return
    progressRef.current = key
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeProgressUpdated, {
      surface: 'challenge_detail',
      source: 'challenge_route',
      challenge_id: id,
      progress_value: currentEntry.value,
      result: 'updated',
    })
  }, [id, currentEntry, loading])

  // Meta alcanzada: una sola vez por reto.
  const completionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!id || loading || !challenge?.goal || challenge.goal <= 0) return
    if (!currentEntry || currentEntry.value < challenge.goal || completionRef.current === id) return
    completionRef.current = id
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeCompleted, {
      surface: 'challenge_detail',
      source: 'challenge_goal_reached',
      challenge_id: id,
      result: 'completed',
    })
  }, [id, challenge, currentEntry, loading])

  const isParticipant = !!userId && participantIds.has(userId)
  const isActive = challenge?.status === 'active'
  const goalReached = !!challenge?.goal && !!currentEntry && currentEntry.value >= challenge.goal

  // ── Fila propia fijada (rama de ranking) ──────────────────────────────────
  // Se mide en vez de fijarla siempre: con una lista corta tu fila ya está a la
  // vista y una copia anclada abajo sería ruido. El estado solo cambia al cruzar
  // el borde de visibilidad, no en cada tick de scroll.
  const [ownRowVisible, setOwnRowVisible] = useState(true)
  const viewportH = useRef(0)
  const listY = useRef(0)
  const ownRow = useRef<{ y: number; h: number } | null>(null)
  const scrollY = useRef(0)

  const recomputeOwnRowVisibility = useCallback(() => {
    const row = ownRow.current
    if (!row || !viewportH.current) return
    const top = listY.current + row.y
    const bottom = top + row.h
    const visible = bottom > scrollY.current && top < scrollY.current + viewportH.current
    setOwnRowVisible(prev => (prev === visible ? prev : visible))
  }, [])

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y
    recomputeOwnRowVisibility()
  }, [recomputeOwnRowVisibility])

  const handleOwnRowLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout
    ownRow.current = { y, h: height }
    recomputeOwnRowVisibility()
  }, [recomputeOwnRowVisibility])

  const handleJoin = async () => {
    if (!userId || !id) return
    setJoining(true)
    try {
      await pb.collection('challenge_participants').create({ challenge: id, user: userId })
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeJoined, {
        surface: 'challenge_detail',
        source: 'challenge_detail',
        challenge_id: id,
        participant_count: leaderboard.length + 1,
        result: 'joined',
      })
      load()
    } catch {
      // 400 = ya participaba (índice único); degradar en silencio, igual que challenges.tsx
    } finally {
      setJoining(false)
    }
  }

  if (loading && !challenge) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <Header router={router} title="" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={LIME} />
        </View>
      </SafeAreaView>
    )
  }

  if (!challenge) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <Header router={router} title="" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-2xl">😕</Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {t('challenges.notFound')}
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  const layout = getChallengeLayout(challenge)
  const isGoalLayout = layout === 'goal'
  const progress = getGoalProgress(currentEntry?.value ?? 0, challenge.goal)

  const metricLabel = getMetricLabel(challenge.metric, challenge.custom_metric, challenge.exercise_slug)
  const unit = getMetricUnit(challenge.metric, challenge.exercise_slug)
  // Los retos de preset guardan un slug de catálogo; el título/descripción reales
  // viven en i18n (#350), así que se resuelven aquí en vez de usar el campo crudo.
  const title = resolvePresetChallengeTitle(challenge)
  const description = resolvePresetChallengeDescription(challenge)
  // El "N días restantes" de al lado no dice cuándo empieza ni acaba, y en un reto
  // ya terminado no queda ninguna fecha. Va en la misma fila meta a propósito: es
  // la misma pregunta ("¿cuándo va esto?"). Vacío si los campos no son válidos.
  const dateRange = formatDateRange(challenge.starts_at, challenge.ends_at)

  const ownPosition = currentEntry ? leaderboard.findIndex(e => e.isCurrentUser) + 1 : 0
  // Solo tiene sentido anclar la fila si estás en una lista que se puede recorrer.
  const showPinnedOwnRow = !isGoalLayout && !!currentEntry && !ownRowVisible

  const rankRows = leaderboard.map((entry, i) => (
    <View key={entry.userId} onLayout={entry.isCurrentUser ? handleOwnRowLayout : undefined}>
      <RankRow entry={entry} position={i + 1} unit={unit} variant={isGoalLayout ? 'card' : 'flat'} />
    </View>
  ))

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <Header router={router} title="" />

      <ScrollView
        contentContainerClassName="px-4 pb-12 gap-4"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={isGoalLayout ? undefined : handleScroll}
        onLayout={e => { viewportH.current = e.nativeEvent.layout.height; recomputeOwnRowVisibility() }}
      >
        {/* Título */}
        <Text className="font-bebas text-3xl leading-none text-foreground">{title}</Text>

        {/* Rama con meta: el progreso va antes que nada, para que se vea cuánto
            falta sin hacer scroll. Se pinta aunque aún no participes (valor 0):
            así el reto dice qué es y qué significa apuntarse. */}
        {isGoalLayout && (
          <GoalHero
            value={currentEntry?.value ?? 0}
            goal={challenge.goal ?? 0}
            unit={unit}
            pct={progress.pct}
            remaining={progress.remaining}
            reached={progress.reached}
          />
        )}

        {/* Fila meta. El "· " va pegado a la etiqueta que separa, en el mismo
            string: como Text suelto, la fila envolvía y lo dejaba colgado al
            final de la línea; y anidando un Text para teñirlo de gris, RN se come
            el espacio que lo sigue y queda "·30 ago". El separador toma el color
            de lo que separa. */}
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1.5">
            <Text className="font-mono text-[10px] tracking-wide text-lime">{metricLabel}</Text>
            {/* La píldora de meta desaparece en la rama con meta: el héroe ya la dice. */}
            {!isGoalLayout && (challenge.goal ?? 0) > 0 && (
              <Text className="font-mono text-[10px] text-amber-400">
                · {t('challenges.goal', { value: challenge.goal })}
              </Text>
            )}
            {dateRange ? (
              <Text className="font-mono text-[10px] text-foreground">· {dateRange}</Text>
            ) : null}
            {/* En la rama con meta el héroe ya dice si está completado, así que
                esta ranura vuelve a lo suyo (cuánto queda) en vez de repetirlo. */}
            <Text className={cn('font-mono text-[10px]', isActive ? 'text-amber-400' : 'text-muted-foreground')}>
              ·{' '}
              {!isGoalLayout && goalReached
                ? t('challenge.preset.completed')
                : isActive
                  ? daysRemaining(challenge.ends_at, challenge.starts_at)
                  : t('challenge.preset.expired')}
            </Text>
            <Text className="font-mono text-[10px] text-muted-foreground">
              · {t('challenges.participants', { count: leaderboard.length })}
            </Text>
          </View>

          {/* En la rama de ranking la cabecera se encoge para que la lista empiece
              antes: la descripción se recorta en vez de ocupar lo que quiera. */}
          {description ? (
            <Text
              className="text-sm leading-relaxed text-muted-foreground"
              numberOfLines={isGoalLayout ? undefined : 2}
            >
              {description}
            </Text>
          ) : null}
        </View>

        {/* Unirse — solo si el reto está activo y aún no participa */}
        {isActive && userId && !isParticipant && (
          <Pressable
            onPress={handleJoin}
            disabled={joining}
            className={cn('items-center rounded-lg bg-lime py-3 active:opacity-80', joining && 'opacity-50')}
            accessibilityRole="button"
          >
            <Text className="font-mono text-[11px] uppercase tracking-widest text-lime-foreground">
              {joining ? '...' : t('featuredChallenge.join')}
            </Text>
          </Pressable>
        )}

        {/* Clasificación */}
        {isGoalLayout ? (
          <View className="gap-1.5">
            <Pressable
              onPress={() => setLeaderboardOpen(open => !open)}
              className="flex-row items-center justify-between border-t border-border py-3 active:opacity-70"
              accessibilityRole="button"
              accessibilityState={{ expanded: leaderboardOpen }}
              accessibilityLabel={t('challenge.leaderboard')}
            >
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('challenge.leaderboard')} · {t('challenges.participants', { count: leaderboard.length })}
              </Text>
              <ChevronDown
                size={16}
                color="hsl(0 0% 55%)"
                style={{ transform: [{ rotate: leaderboardOpen ? '180deg' : '0deg' }] }}
              />
            </Pressable>
            {leaderboardOpen && (
              <View className="gap-1.5">
                {leaderboard.length === 0 ? (
                  <Text className="py-8 text-center text-sm text-muted-foreground">{t('common.noResults')}</Text>
                ) : (
                  rankRows
                )}
              </View>
            )}
          </View>
        ) : (
          // A sangre: la lista se come el padding del scroll para ocupar la pantalla.
          <View className="-mx-4 border-t border-border" onLayout={e => { listY.current = e.nativeEvent.layout.y; recomputeOwnRowVisibility() }}>
            {leaderboard.length === 0 ? (
              <Text className="py-8 text-center text-sm text-muted-foreground">{t('common.noResults')}</Text>
            ) : (
              rankRows
            )}
          </View>
        )}
      </ScrollView>

      {/* Tu fila, anclada abajo mientras la de verdad está fuera de la vista. */}
      {showPinnedOwnRow && currentEntry && (
        <View className="absolute inset-x-0 bottom-0 border-t border-lime/40 bg-background" pointerEvents="box-none">
          <RankRow entry={currentEntry} position={ownPosition} unit={unit} variant="flat" />
        </View>
      )}
    </SafeAreaView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({ router, title }: { router: ReturnType<typeof useRouter>; title: string }) {
  const { t } = useTranslation()
  return (
    <View className="flex-row items-center gap-2 px-2 py-1">
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        className="p-2"
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <ArrowLeft size={20} color="hsl(0 0% 55%)" />
      </Pressable>
      {title ? (
        <Text className="flex-1 font-bebas text-xl leading-none text-foreground" numberOfLines={1}>
          {title}
        </Text>
      ) : null}
    </View>
  )
}

/** El héroe de la rama con meta: tú contra la cifra. */
function GoalHero({
  value, goal, unit, pct, remaining, reached,
}: {
  value: number; goal: number; unit: string; pct: number; remaining: number; reached: boolean
}) {
  const { t } = useTranslation()

  return (
    <View className="gap-3">
      <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t('challenge.preset.progress')}
      </Text>

      <View className="flex-row items-baseline gap-2">
        <Text className="font-bebas text-6xl leading-none text-lime">{value}</Text>
        <Text className="font-mono text-sm text-muted-foreground">/ {withUnit(goal, unit)}</Text>
      </View>

      <View
        className="h-3 overflow-hidden rounded-full border border-border bg-card"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: goal, now: value }}
      >
        <View className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
      </View>

      <Text className={cn('font-mono text-[10px] tracking-wide', reached ? 'text-lime' : 'text-muted-foreground')}>
        {reached
          ? t('challenge.preset.completed')
          : t('challenge.goalRemaining', { value: withUnit(remaining, unit) })}
      </Text>
    </View>
  )
}

function RankRow({
  entry, position, unit, variant,
}: {
  entry: LeaderboardEntry; position: number; unit: string; variant: 'card' | 'flat'
}) {
  const router = useRouter()
  const medal = MEDALS[position - 1]

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/u/[id]', params: { id: entry.userId } })}
      className={cn(
        'flex-row items-center gap-3 active:opacity-70',
        variant === 'card'
          ? cn('rounded-xl border px-4 py-3', entry.isCurrentUser ? 'border-lime/40 bg-lime/10' : 'border-border bg-card')
          : cn('border-b border-border px-4 py-3.5', entry.isCurrentUser && 'bg-lime/10'),
      )}
      accessibilityRole="button"
    >
      <View className="w-7 items-center">
        {medal ? (
          <Text className="text-base">{medal}</Text>
        ) : (
          <Text className="font-mono text-xs text-muted-foreground">{position}</Text>
        )}
      </View>

      <View className="size-9 items-center justify-center overflow-hidden rounded-full bg-accent">
        {entry.avatarUrl ? (
          <Image
            source={{ uri: entry.avatarUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={entry.userId}
            accessibilityLabel={entry.displayName}
          />
        ) : (
          <Text className="font-mono text-xs text-foreground">{(entry.displayName[0] ?? '?').toUpperCase()}</Text>
        )}
      </View>

      <View className="flex-1 min-w-0">
        <Text
          className={cn('font-sans-medium text-sm', entry.isCurrentUser ? 'text-lime' : 'text-foreground')}
          numberOfLines={1}
        >
          {entry.displayName}
        </Text>
      </View>

      <View className="flex-row items-baseline gap-1">
        <Text className={cn('font-bebas text-2xl leading-none', entry.isCurrentUser ? 'text-lime' : 'text-foreground')}>
          {entry.value}
        </Text>
        {unit ? <Text className="font-mono text-[10px] text-muted-foreground">{unit}</Text> : null}
      </View>
    </Pressable>
  )
}
