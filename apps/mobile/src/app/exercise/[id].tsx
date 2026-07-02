import { View, ScrollView, Pressable, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getCatalogExercise } from '@/lib/catalog'
import { localize, type TranslatableField } from '@calistenia/core/lib/i18n-db'
import { getExerciseEquipment, getEquipmentLabelKey } from '@calistenia/core/lib/equipment'
import { getVariantsByLevel, type VariantEntry } from '@calistenia/core/lib/variants'

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const locale = i18n.language

  const ex = id ? getCatalogExercise(id) : undefined

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
  const description = ex ? localize(ex.description as TranslatableField, locale) : ''

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
          </>
        )}
      </ScrollView>
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
