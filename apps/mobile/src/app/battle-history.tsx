/** Historial de batallas (#398). El balance y las filas viven en `BattleHistoryList` (#860). */
import { View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import BattleHistoryList from '@/components/battle/BattleHistoryList'

export default function BattleHistoryScreen() {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BattleHistoryList
        header={
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.back()} className="-ml-2 p-2 active:opacity-60">
              <ChevronLeft size={22} color="#888899" />
            </Pressable>
            <View className="flex-1">
              <Kicker>
                {t('battle.historyKicker')}
              </Kicker>
              <Text className="font-bebas text-4xl leading-none text-foreground">
                {t('battle.historyTitle')}
              </Text>
            </View>
          </View>
        }
      />
    </SafeAreaView>
  )
}
