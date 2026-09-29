/** Clasificación — port móvil de LeaderboardPage. La lista vive en `LeaderboardList` (#860). */
import { View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import LeaderboardList from '@/components/community/LeaderboardList'

export default function LeaderboardScreen() {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-start justify-between px-4 pt-2 pb-4">
        <View>
          <Kicker>
            {t('leaderboard.section')}
          </Kicker>
          <Text className="font-bebas text-4xl leading-none text-foreground">{t('leaderboard.title')}</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-muted/60 p-2 active:opacity-70"
        >
          <X size={18} color="#888899" />
        </Pressable>
      </View>

      <LeaderboardList />
    </SafeAreaView>
  )
}
