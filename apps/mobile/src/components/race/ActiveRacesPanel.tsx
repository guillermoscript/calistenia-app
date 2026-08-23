/**
 * Búsqueda de competencias activas (públicas, en `waiting` o `countdown`) desde
 * la propia pantalla de cardio. La pantalla completa con geolocalización y radio
 * sigue viviendo en /races-discover; aquí solo va el buscador por nombre.
 */
import { useEffect, useState } from 'react'
import { View, Pressable, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { useDiscoverRaces } from '@calistenia/core/hooks/useDiscoverRaces'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'

/** Cuántas carreras se listan en línea antes de mandar a /races-discover. */
const MAX_INLINE = 5

export default function ActiveRacesPanel() {
  const { t } = useTranslation()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  // La queryKey de useDiscoverRaces incluye `search`: sin debounce se dispara
  // una consulta por pulsación.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(id)
  }, [search])

  const { races, loading, error } = useDiscoverRaces({ search: debounced })
  const shown = races.slice(0, MAX_INLINE)

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <Kicker>{t('race.activeTitle')}</Kicker>
        <Pressable onPress={() => router.push('/races-discover')} className="active:opacity-70">
          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t('race.seeAll')}
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('race.searchPlaceholder')}
        placeholderTextColor="#71717a"
        autoCapitalize="none"
        className="h-11 rounded-xl border border-border bg-muted/30 px-3.5 text-sm text-foreground"
      />

      {error ? (
        <Text className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </Text>
      ) : null}

      {loading && shown.length === 0 ? (
        <Text className="py-3 text-xs text-muted-foreground">{t('common.loading')}</Text>
      ) : null}

      {!loading && shown.length === 0 ? (
        <Text className="py-3 text-xs text-muted-foreground">
          {debounced ? t('race.noPublicRaces') : t('race.createAndShare')}
        </Text>
      ) : null}

      <View className="gap-2">
        {shown.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push(`/race/${r.id}`)}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 active:opacity-70"
          >
            <Text className="text-xl">{CARDIO_ACTIVITY[r.activity_type]?.icon ?? '🏁'}</Text>
            <View className="flex-1 shrink">
              <Text className="font-sans-medium text-foreground" numberOfLines={1}>{r.name}</Text>
              <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {r.mode === 'distance'
                  ? `${r.target_distance_km} km`
                  : `${Math.round(r.target_duration_seconds / 60)} min`}
                {' · '}
                {t(r.status === 'countdown' ? 'race.startingSoon' : 'race.waitingLabel')}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {races.length > MAX_INLINE ? (
        <Pressable onPress={() => router.push('/races-discover')} className="items-center py-1 active:opacity-70">
          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t('race.moreItems', { n: races.length - MAX_INLINE })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
