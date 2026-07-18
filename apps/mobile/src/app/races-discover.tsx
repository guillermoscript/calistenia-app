/** Races públicas cerca — port móvil de RacesDiscoverPage (useDiscoverRaces de core). */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, ScrollView, Pressable, TextInput, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X, MapPin, Flag } from 'lucide-react-native'
import * as Location from 'expo-location'
import { Text } from '@/components/ui/text'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useDiscoverRaces } from '@calistenia/core/hooks/useDiscoverRaces'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'

const RADII = [5, 10, 25, 50, 100]

export default function RacesDiscoverScreen() {
  const { t } = useTranslation()
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [radiusKm, setRadiusKm] = useState(50)
  const [locating, setLocating] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const { races, loading } = useDiscoverRaces({
    search,
    nearLat: coords?.lat ?? null,
    nearLng: coords?.lng ?? null,
    radiusKm,
    reloadToken,
  })

  const refreshingRef = useRef(false)
  const handleRefresh = useCallback(() => {
    refreshingRef.current = true
    setRefreshing(true)
    setReloadToken((n) => n + 1)
  }, [])
  useEffect(() => {
    if (refreshingRef.current && !loading) {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }, [loading])

  const handleUseLocation = async () => {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      }
    } catch { /* sin ubicación — lista sin filtro geo */ }
    setLocating(false)
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerClassName="px-4 pb-10 gap-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#a3e635" colors={['#a3e635']} />}
      >
        <View className="flex-row items-start justify-between pt-2">
          <View>
            <Text className="font-bebas text-4xl leading-none text-foreground">{t('race.nearbyTitle')}</Text>
            <Text className="mt-1 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('race.nearbySubtitle')}
            </Text>
          </View>
          <Pressable onPress={() => router.back()} className="rounded-full bg-muted/60 p-2 active:opacity-70">
            <X size={18} color="#888899" />
          </Pressable>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('race.searchPlaceholder')}
          placeholderTextColor="#71717a"
          className="h-11 rounded-xl border border-border bg-muted/30 px-3.5 text-sm text-foreground"
        />

        {/* Ubicación + radio */}
        {coords ? (
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <MapPin size={13} color="#a3e635" />
                <Text className="font-mono text-[11px] text-lime">{t('race.locationOk')}</Text>
              </View>
              <Pressable onPress={() => setCoords(null)}>
                <Text className="text-xs text-muted-foreground">{t('race.removeLocation')}</Text>
              </Pressable>
            </View>
            <View className="flex-row gap-1.5">
              {RADII.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => {
                    if (r !== radiusKm) void haptics.selection()
                    setRadiusKm(r)
                  }}
                  className={cn('flex-1 items-center rounded-lg border py-1.5', radiusKm === r ? 'border-lime/40 bg-lime/10' : 'border-border')}
                >
                  <Text className={cn('font-mono text-[10px]', radiusKm === r ? 'text-lime' : 'text-muted-foreground')}>{r}km</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Pressable
            onPress={handleUseLocation}
            disabled={locating}
            className="h-11 items-center justify-center rounded-xl border border-border active:bg-muted/50"
          >
            <Text className="font-mono text-xs text-muted-foreground">
              {locating ? t('race.locating') : t('race.useLocation')}
            </Text>
          </Pressable>
        )}

        {/* Resultados */}
        {loading ? (
          <View className="items-center py-10">
            <Text className="text-muted-foreground">{t('common.loading')}</Text>
          </View>
        ) : races.length === 0 ? (
          <EmptyState
            icon={Flag}
            title={t('race.noPublicRaces')}
            body={t('race.discoverBody')}
            ctaLabel={t('race.discoverCta')}
            onCtaPress={() => router.push('/race-create')}
          />
        ) : (
          <View className="gap-2">
            {races.map((race) => (
              <Pressable
                key={race.id}
                onPress={() => router.push(`/race/${race.id}`)}
                className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:opacity-70"
              >
                <Text className="text-xl">{CARDIO_ACTIVITY[race.activity_type]?.icon ?? '🏁'}</Text>
                <View className="flex-1">
                  <Text className="font-sans-medium text-foreground" numberOfLines={1}>{race.name}</Text>
                  <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {race.mode === 'distance'
                      ? `${race.target_distance_km} km`
                      : `${Math.round(race.target_duration_seconds / 60)} min`}
                    {' · '}
                    {t(race.status === 'countdown' ? 'race.startingSoon' : 'race.waitingLabel')}
                  </Text>
                </View>
                {race.distanceKm != null && (
                  <Text className="font-mono text-[11px] text-lime">{race.distanceKm.toFixed(1)} km</Text>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
