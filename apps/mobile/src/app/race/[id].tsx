/** Pantalla de carrera: enruta por fase (lobby/countdown/live/results). */
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { useAuthUser } from '@/lib/use-auth-user'
import { RaceProvider, useRaceContext } from '@/contexts/RaceContext'
import RaceLobby from '@/components/race/RaceLobby'
import RaceCountdown from '@/components/race/RaceCountdown'
import RaceLive from '@/components/race/RaceLive'
import RaceResults from '@/components/race/RaceResults'

function RacePhaseRouter({ displayName }: { displayName: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { phase } = useRaceContext()

  if (phase === 'countdown') return <RaceCountdown />

  return (
    <ScrollView contentContainerClassName="px-4 pb-10">
      <View className="flex-row justify-end pt-2">
        <Pressable onPress={() => router.back()} className="rounded-full bg-muted/60 p-2 active:opacity-70" accessibilityLabel={t('common.back')}>
          <X size={18} color="#888899" />
        </Pressable>
      </View>

      {phase === 'loading' && (
        <View className="items-center py-16">
          <Text className="text-muted-foreground">{t('common.loading')}</Text>
        </View>
      )}
      {phase === 'not_found' && (
        <View className="items-center py-16">
          <Text className="font-bebas text-2xl text-muted-foreground">{t('race.noRace')}</Text>
        </View>
      )}
      {phase === 'cancelled' && (
        <View className="items-center py-16">
          <Text className="font-bebas text-2xl text-red-400">{t('race.cancelled')}</Text>
        </View>
      )}
      {phase === 'lobby' && <RaceLobby displayName={displayName} />}
      {phase === 'racing' && <RaceLive />}
      {phase === 'finished' && <RaceResults />}
    </ScrollView>
  )
}

export default function RaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const user = useAuthUser()
  const displayName =
    (user as any)?.display_name || (user as any)?.email?.split('@')[0] || t('race.athlete')

  if (!id) return null

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <RaceProvider raceId={id}>
        <RacePhaseRouter displayName={displayName} />
      </RaceProvider>
    </SafeAreaView>
  )
}
