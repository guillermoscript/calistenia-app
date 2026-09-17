import { useEffect, useState } from 'react'
import { View, ScrollView, Pressable, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Kicker } from '@/components/ui/kicker'
import { ImageViewer } from '@/components/ui/image-viewer'
import { getCatalogExercise } from '@/lib/catalog'
import { getExerciseMedia } from '@calistenia/core/lib/exerciseMedia'
import { getCatalogStaticMedia } from '@calistenia/core/lib/catalogMedia'
import { localize, type TranslatableField } from '@calistenia/core/lib/i18n-db'
import { getExerciseEquipment, getEquipmentLabelKey } from '@calistenia/core/lib/equipment'
import { getVariantsByLevel, getRelatedExercises, type VariantEntry } from '@calistenia/core/lib/variants'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const locale = i18n.language

  const ex = id ? getCatalogExercise(id) : undefined

  // #636 §4: la ficha nativa tampoco emitía nada. El catálogo es síncrono, así
  // que no hace falta esperar a ninguna carga.
  useEffect(() => {
    if (!ex) return
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.exerciseViewed, {
      surface: 'exercise_catalog', source: 'exercise_screen',
      exercise_id: ex.id,
      category: ex.category,
      difficulty: ex.difficulty,
    })
  }, [ex?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- una vista por ficha

  const openYoutube = () => {
    if (!ex) return
    const url = ex.youtube_search
      || `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.youtube_query || localize(ex.name, locale))}`
    Linking.openURL(url).catch(() => {})
  }

  const equipment = ex ? getExerciseEquipment({ id: ex.id, equipment: ex.equipment } as any) : []
  const variantLevels = ex ? getVariantsByLevel(ex.id, 6) : { easier: [], similar: [], harder: [] }
  const variantGroups = ([
    ['easier', variantLevels.easier, 'text-emerald-400'],
    ['similar', variantLevels.similar, 'text-amber-400'],
    ['harder', variantLevels.harder, 'text-red-400'],
  ] as const).filter(([, list]) => list.length > 0)
  const related = ex ? getRelatedExercises(ex.id, 6) : []
  const description = ex ? localize(ex.description as TranslatableField, locale) : ''

  // Demo del movimiento y mapa de músculos del catálogo, con la misma
  // resolución que la sesión (`components/session/ExerciseScreen.tsx`): las
  // rutas del catálogo son relativas al origen y en el dispositivo hay que
  // prefijarlas con el host.
  const media = ex
    ? getExerciseMedia(
        {},
        {
          mediaBaseUrl: process.env.EXPO_PUBLIC_PB_URL || 'https://gym.guille.tech',
          catalogRecord: { staticMedia: getCatalogStaticMedia(ex.id) },
        },
      )
    : null
  const [viewer, setViewer] = useState<{ uri: string; label: string } | null>(null)

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-2 px-2 py-1">
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-2" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={20} color="hsl(0 0% 55%)" />
        </Pressable>
        <Text className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
          {ex ? localize(ex.name, locale) : ''}
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-8 gap-4">
        {!ex ? (
          <Text className="py-10 text-center text-muted-foreground">{t('common.noResults')}</Text>
        ) : (
          <>
            {!!media?.sequence && (
              <Pressable
                onPress={() => setViewer({ uri: media.sequence!, label: localize(ex.name, locale) })}
                accessibilityRole="imagebutton"
                accessibilityLabel={localize(ex.name, locale)}
                accessibilityHint={t('common.viewFullscreen')}
                className="overflow-hidden rounded-xl border border-border bg-card active:opacity-80"
              >
                <Image
                  source={{ uri: media.sequence }}
                  style={{ width: '100%', aspectRatio: 16 / 9 }}
                  contentFit="contain"
                  transition={150}
                  cachePolicy="memory-disk"
                  recyclingKey={`${ex.id}:sequence`}
                />
              </Pressable>
            )}

            {/* El mapa es vertical (≈1:2): a todo el ancho con su proporción
                ocuparía más de una pantalla, así que va en una caja de alto fijo
                con `contain` y se ve entero en el visor. */}
            {!!media?.muscles && (
              <View className="gap-2">
                <Kicker>{t('exerciseDetail.tab.muscles')}</Kicker>
                <Pressable
                  onPress={() => setViewer({ uri: media.muscles!, label: t('exerciseDetail.tab.muscles') })}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={t('exerciseDetail.tab.muscles')}
                  accessibilityHint={t('common.viewFullscreen')}
                  className="h-64 overflow-hidden rounded-xl border border-border bg-card py-2 active:opacity-80"
                >
                  <Image
                    source={{ uri: media.muscles }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="contain"
                    transition={150}
                    cachePolicy="memory-disk"
                    recyclingKey={`${ex.id}:muscles`}
                  />
                </Pressable>
              </View>
            )}

            <Card>
              <CardContent className="gap-3 py-4">
                <Text className="font-bebas text-3xl leading-none text-foreground">{localize(ex.name, locale)}</Text>
                <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">{localize(ex.muscles, locale)}</Text>

                <View className="flex-row flex-wrap gap-2">
                  <Chip label={ex.category.replace(/_/g, ' ')} />
                  {ex.difficulty && <Chip label={t(`difficulty.${ex.difficulty}`)} />}
                  {ex.isTimer && ex.timerSeconds ? <Chip label={`${ex.timerSeconds}s`} /> : null}
                </View>

                <View className="flex-row gap-4 rounded-lg bg-muted/40 px-4 py-3">
                  <Stat label={t('common.sets')} value={String(ex.sets)} />
                  <Stat label={t('common.reps')} value={ex.reps} />
                  <Stat label={t('common.rest')} value={`${ex.rest}s`} />
                </View>
              </CardContent>
            </Card>

            {description ? (
              <Card>
                <CardContent className="py-4">
                  <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-[2px] text-lime">{t('exerciseDetail.tab.description')}</Text>
                  <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
                </CardContent>
              </Card>
            ) : null}

            {localize(ex.note, locale) ? (
              <Card>
                <CardContent className="py-4">
                  <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-[2px] text-lime">{t('session.note')}</Text>
                  <Text className="font-sans-italic text-sm leading-5 text-muted-foreground">{localize(ex.note, locale)}</Text>
                </CardContent>
              </Card>
            ) : null}

            {equipment.length > 0 && (
              <View className="flex-row flex-wrap gap-2">
                {equipment.map(eq => (
                  <Chip key={eq} label={t(getEquipmentLabelKey(eq))} />
                ))}
              </View>
            )}

            <Button variant="outline" className="border-red-500/30 bg-red-500/5" onPress={openYoutube}>
              <View className="flex-row items-center gap-2">
                <ExternalLink size={16} color="hsl(0 84% 60%)" />
                <Text className="text-sm text-red-500">YouTube</Text>
              </View>
            </Button>

            {variantGroups.length > 0 && (
              <View className="gap-2">
                <Text className="mt-2 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                  {t('exerciseDetail.variants')}
                </Text>
                {variantGroups.map(([level, list, accent]) => (
                  <View key={level} className="gap-2">
                    <Text className={`mt-1 font-mono text-[9px] uppercase tracking-[2px] ${accent}`}>
                      {t(`exerciseDetail.variants${level === 'easier' ? 'Easier' : level === 'harder' ? 'Harder' : 'Similar'}`)}
                    </Text>
                    {list.map((v: VariantEntry) => (
                      <Pressable
                        key={v.id}
                        onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: v.id } })}
                        className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
                      >
                        <View className="flex-1">
                          <Text className="font-sans-medium text-foreground" numberOfLines={1}>
                            {localize(v.name as TranslatableField, locale)}
                          </Text>
                          <View className="mt-0.5 flex-row items-center gap-2">
                            {v.difficulty && (
                              <Text className="font-mono text-[9px] capitalize text-muted-foreground/70">{t(`difficulty.${v.difficulty}`)}</Text>
                            )}
                            <Text className="font-mono text-[9px] text-muted-foreground/70" numberOfLines={1}>
                              {(v.equipment ?? []).map(eq => t(getEquipmentLabelKey(eq))).join(' · ')}
                            </Text>
                          </View>
                        </View>
                        <ChevronRight size={16} color="hsl(0 0% 55%)" />
                      </Pressable>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {related.length > 0 && (
              <View className="gap-2">
                <Text className="mt-2 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                  {t('exerciseDetail.related')}
                </Text>
                {related.map((v: VariantEntry) => (
                  <Pressable
                    key={v.id}
                    onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: v.id } })}
                    className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
                  >
                    <View className="flex-1">
                      <Text className="font-sans-medium text-foreground" numberOfLines={1}>
                        {localize(v.name as TranslatableField, locale)}
                      </Text>
                      <View className="mt-0.5 flex-row items-center gap-2">
                        {v.difficulty && (
                          <Text className="font-mono text-[9px] capitalize text-muted-foreground/70">{t(`difficulty.${v.difficulty}`)}</Text>
                        )}
                        <Text className="font-mono text-[9px] text-muted-foreground/70" numberOfLines={1}>
                          {localize(v.muscles as TranslatableField, locale)}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={16} color="hsl(0 0% 55%)" />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ImageViewer uri={viewer?.uri ?? null} label={viewer?.label} onClose={() => setViewer(null)} />
    </SafeAreaView>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-muted px-2.5 py-1">
      <Text className="font-mono text-[10px] capitalize tracking-wide text-muted-foreground">{label}</Text>
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="font-bebas text-2xl leading-none text-foreground">{value}</Text>
      <Text className="mt-1 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">{label}</Text>
    </View>
  )
}
