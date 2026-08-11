/**
 * FeaturedChallengeCard — reto comunitario destacado en Home (issue #351).
 *
 * Card compacta que muestra el reto `is_featured` más urgente (el que antes
 * termina) con un único CTA según el estado del usuario: unirse, continuar o
 * ver resultados. La selección y el estado vienen ya resueltos de
 * `useFeaturedChallenge` (core, compartido con la web); aquí solo se pinta y
 * se trackea.
 *
 * El wrapper (export default) decide si renderiza y el componente interno es
 * quien monta el hook de datos — mismo patrón que GettingStartedCard.
 */
import { useEffect, useRef } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Flag } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { COLORS } from '@/lib/theme'
import { useFeaturedChallenge } from '@calistenia/core/hooks/useFeaturedChallenge'
import { trackFeaturedChallengeViewed, trackFeaturedChallengeOpened } from '@calistenia/core/lib/featured-challenge'
import { getMetricLabel } from '@calistenia/core/lib/challenges'
import { resolvePresetChallengeTitle } from '@calistenia/core/lib/challenge-presets'

interface FeaturedChallengeCardProps {
  userId: string | null
}

export default function FeaturedChallengeCard({ userId }: FeaturedChallengeCardProps) {
  if (!userId) return null
  return <FeaturedChallengeInner userId={userId} />
}

function FeaturedChallengeInner({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { card, participantCount, loading, joining, join } = useFeaturedChallenge(userId)

  // Impresión: una vez por reto. El objeto `card` cambia de identidad en cada
  // refetch (staleTime, invalidate tras unirse), así que sin este registro el
  // mismo reto contaría varias vistas.
  const viewedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!card) return
    if (viewedIdRef.current === card.challenge.id) return
    viewedIdRef.current = card.challenge.id
    trackFeaturedChallengeViewed(card)
  }, [card])

  if (loading) {
    return (
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-2.5 w-28 rounded" />
        <Skeleton className="h-6 w-40 rounded" />
        <Skeleton className="h-2.5 w-32 rounded" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </View>
    )
  }

  if (!card) return null

  const open = () => {
    trackFeaturedChallengeOpened(card)
    router.push(`/challenges/${card.challenge.id}`)
  }

  const handleJoin = async () => {
    await join(card.challenge.id)
    open()
  }

  const metricLabel = getMetricLabel(card.challenge.metric, card.challenge.custom_metric, card.challenge.exercise_slug)
  // Un reto de preset (#350) guarda el título de catálogo; el visible vive en
  // i18n. Sin preset_key devuelve el título tal cual.
  const title = resolvePresetChallengeTitle(card.challenge)
  const daysLabel =
    card.state === 'results'
      ? t('featuredChallenge.ended')
      : card.daysRemaining <= 0
        ? t('featuredChallenge.lastDay')
        : t('featuredChallenge.daysLeft', { count: card.daysRemaining })
  const ctaLabel =
    card.state === 'join'
      ? t('featuredChallenge.join')
      : card.state === 'continue'
        ? t('featuredChallenge.continue')
        : t('featuredChallenge.results')

  return (
    <Pressable
      onPress={open}
      className="gap-3 rounded-xl border border-lime/30 bg-card p-4 active:opacity-90"
      accessibilityRole="button"
    >
      {/* Kicker */}
      <View className="flex-row items-center gap-1.5">
        <Flag size={12} color={COLORS.lime} />
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
          {t('featuredChallenge.kicker')}
        </Text>
      </View>

      {/* Title */}
      <Text className="font-bebas text-2xl leading-none text-foreground" numberOfLines={2}>
        {title}
      </Text>

      {/* Metadata: métrica · participantes · días restantes / terminado */}
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text className="font-mono text-[10px] text-lime">{metricLabel}</Text>
        <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
        <Text className="font-mono text-[10px] text-muted-foreground">
          {t('challenges.participants', { count: participantCount })}
        </Text>
        <Text className="font-mono text-[10px] text-muted-foreground">·</Text>
        <Text
          className={cn(
            'font-mono text-[10px]',
            card.state === 'results' ? 'text-muted-foreground' : 'text-amber-400',
          )}
        >
          {daysLabel}
        </Text>
      </View>

      {/* Ya participa y el reto sigue vivo: barra de progreso temporal en vez de CTA de unirse */}
      {card.state === 'continue' && (
        <View className="gap-1.5">
          <View className="h-1 overflow-hidden rounded-full bg-muted">
            <View className="h-full rounded-full bg-lime" style={{ width: `${card.progressPct}%` }} />
          </View>
          <Text className="font-mono text-[10px] uppercase tracking-wide text-lime">
            {t('featuredChallenge.participating')}
          </Text>
        </View>
      )}

      {/* CTA único por estado — Pressable anidado: el interior gana el toque (mismo idioma que HomeActivity) */}
      {card.state === 'join' ? (
        <Pressable
          onPress={handleJoin}
          disabled={joining}
          className={cn('items-center rounded-lg bg-lime py-2.5 active:opacity-80', joining && 'opacity-50')}
          accessibilityRole="button"
        >
          <Text className="font-mono text-[11px] uppercase tracking-widest text-lime-foreground">
            {joining ? '...' : ctaLabel}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={open}
          className="items-center rounded-lg border border-lime/40 py-2.5 active:bg-lime/10"
          accessibilityRole="button"
        >
          <Text className="font-mono text-[11px] uppercase tracking-widest text-lime">{ctaLabel}</Text>
        </Pressable>
      )}
    </Pressable>
  )
}
