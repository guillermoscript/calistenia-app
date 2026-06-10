/** Crear carrera — port móvil del CreateRaceDialog web (sin RouteDrawer v1). */
import { useState } from 'react'
import { View, ScrollView, Pressable, TextInput, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react-native'
import * as Location from 'expo-location'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { createRace } from '@/lib/race/raceApi'
import { op } from '@calistenia/core/lib/analytics'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import type { RaceActivityType, RaceMode } from '@calistenia/core/types/race'

const ACTIVITIES: RaceActivityType[] = ['running', 'walking', 'cycling']

export default function RaceCreateScreen() {
  const { t } = useTranslation()
  const router = useRouter()

  const [name, setName] = useState('')
  const [activity, setActivity] = useState<RaceActivityType>('running')
  const [mode, setMode] = useState<RaceMode>('distance')
  const [targetKm, setTargetKm] = useState('5')
  const [targetMin, setTargetMin] = useState('20')
  const [isPublic, setIsPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCreate = name.trim().length > 0 && !busy &&
    (mode === 'distance' ? parseFloat(targetKm) > 0 : parseFloat(targetMin) > 0)

  const handleCreate = async () => {
    if (!canCreate) return
    setBusy(true)
    setError(null)
    try {
      // Pública → coordenadas best-effort para "races cerca"
      let origin: { origin_lat?: number; origin_lng?: number } = {}
      if (isPublic) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            origin = { origin_lat: pos.coords.latitude, origin_lng: pos.coords.longitude }
          }
        } catch { /* sin coords — sigue siendo pública */ }
      }
      const race = await createRace({
        name: name.trim().slice(0, 60),
        mode,
        activity_type: activity,
        target_distance_km: mode === 'distance' ? parseFloat(targetKm) : undefined,
        target_duration_seconds: mode === 'time' ? Math.round(parseFloat(targetMin) * 60) : undefined,
        is_public: isPublic,
        ...origin,
      })
      op.track('race_created', { race_id: race.id, mode, activity_type: activity, platform: 'mobile' })
      void haptics.success()
      router.replace(`/race/${race.id}`)
    } catch (e) {
      setError((e as Error).message)
      void haptics.error()
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScrollView contentContainerClassName="px-4 pb-10 gap-5" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View className="flex-row items-start justify-between pt-2">
          <Text className="font-bebas text-4xl leading-none text-foreground">{t('race.create')}</Text>
          <Pressable onPress={() => router.back()} className="rounded-full bg-muted/60 p-2 active:opacity-70">
            <X size={18} color="#888899" />
          </Pressable>
        </View>

        {error && (
          <View className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <Text className="text-sm text-red-400">{error}</Text>
          </View>
        )}

        {/* Nombre */}
        <View className="gap-2">
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">{t('race.name')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder={t('race.name')}
            placeholderTextColor="#71717a"
            className="h-12 rounded-xl border border-border bg-muted/30 px-3.5 text-base text-foreground"
          />
        </View>

        {/* Actividad */}
        <View className="gap-2">
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">{t('race.activity')}</Text>
          <View className="flex-row gap-2">
            {ACTIVITIES.map((a) => (
              <Pressable
                key={a}
                onPress={() => {
                  if (a !== activity) void haptics.selection()
                  setActivity(a)
                }}
                className={cn(
                  'flex-1 items-center gap-1 rounded-xl border py-3',
                  activity === a ? 'border-lime/40 bg-lime/5' : 'border-border bg-card',
                )}
              >
                <Text className="text-xl">{CARDIO_ACTIVITY[a]?.icon}</Text>
                <Text className={cn('font-mono text-[9px] uppercase tracking-[1px]', activity === a ? 'text-lime' : 'text-muted-foreground')}>
                  {t(`cardio.${a}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Modo + objetivo */}
        <View className="gap-2">
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">{t('race.mode')}</Text>
          <View className="flex-row gap-2">
            {(['distance', 'time'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  if (m !== mode) void haptics.selection()
                  setMode(m)
                }}
                className={cn(
                  'flex-1 items-center rounded-xl border py-3',
                  mode === m ? 'border-lime/40 bg-lime/5' : 'border-border bg-card',
                )}
              >
                <Text className={cn('font-bebas text-base uppercase tracking-widest', mode === m ? 'text-lime' : 'text-muted-foreground')}>
                  {t(m === 'distance' ? 'race.modeDistance' : 'race.modeTime')}
                </Text>
              </Pressable>
            ))}
          </View>
          {mode === 'distance' ? (
            <TextInput
              value={targetKm}
              onChangeText={setTargetKm}
              keyboardType="decimal-pad"
              placeholder={t('race.targetDistance')}
              placeholderTextColor="#71717a"
              className="h-12 rounded-xl border border-border bg-muted/30 px-3.5 font-mono text-base text-foreground"
            />
          ) : (
            <TextInput
              value={targetMin}
              onChangeText={setTargetMin}
              keyboardType="number-pad"
              placeholder={t('race.minutes')}
              placeholderTextColor="#71717a"
              className="h-12 rounded-xl border border-border bg-muted/30 px-3.5 font-mono text-base text-foreground"
            />
          )}
        </View>

        {/* Pública */}
        <View className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <View className="flex-1 pr-3">
            <Text className="font-sans-medium text-foreground">{t('race.public')}</Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">{t('race.publicDesc')}</Text>
          </View>
          <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ true: '#a3e635' }} />
        </View>

        <Pressable
          onPress={handleCreate}
          disabled={!canCreate}
          className={cn('h-14 items-center justify-center rounded-xl bg-lime active:bg-lime/90', !canCreate && 'opacity-40')}
        >
          <Text className="font-bebas text-xl uppercase tracking-widest text-zinc-900">{t('race.create')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
