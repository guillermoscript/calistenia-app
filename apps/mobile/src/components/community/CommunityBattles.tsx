/**
 * Sección Batallas de la pestaña Comunidad (#860): la batalla en curso, el
 * acceso a crear una y el historial, en una sola lista.
 *
 * Crear sigue siendo su propia pantalla (`/battle-create`): elige formato y
 * sustituye la ruta por la sala de la batalla recién creada.
 */
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Swords, ChevronRight } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import ActiveBattleRow from '@/components/community/ActiveBattleRow'
import BattleHistoryList from '@/components/battle/BattleHistoryList'

export default function CommunityBattles() {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <BattleHistoryList
      header={
        <View className="gap-3">
          <ActiveBattleRow />
          <Pressable
            onPress={() => router.push('/battle-create')}
            className="min-h-14 flex-row items-center gap-3 rounded-xl border border-lime/40 bg-lime/5 px-4 py-3 active:bg-lime/10"
            accessibilityRole="button"
          >
            <Swords size={20} color="hsl(74 90% 45%)" />
            <View className="flex-1 gap-0.5">
              <Text className="font-bebas text-2xl leading-none text-foreground">{t('battle.newBattle')}</Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                {t('battle.createHint')}
              </Text>
            </View>
            <ChevronRight size={16} color="hsl(0 0% 55%)" />
          </Pressable>
        </View>
      }
    />
  )
}
