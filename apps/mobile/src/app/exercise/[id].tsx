import { View, ScrollView, Pressable, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ExternalLink } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getCatalogExercise } from '@/lib/catalog'
import { localize } from '@calistenia/core/lib/i18n-db'
import { getExerciseEquipment, getEquipmentLabelKey } from '@calistenia/core/lib/equipment'

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
                  {ex.difficulty && <Chip label={ex.difficulty} />}
                  {ex.isTimer && ex.timerSeconds ? <Chip label={`${ex.timerSeconds}s`} /> : null}
                </View>

                <View className="flex-row gap-4 rounded-lg bg-muted/40 px-4 py-3">
                  <Stat label={t('common.sets')} value={String(ex.sets)} />
                  <Stat label={t('common.reps')} value={ex.reps} />
                  <Stat label={t('common.rest')} value={`${ex.rest}s`} />
                </View>
              </CardContent>
            </Card>

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
