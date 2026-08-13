/** Pantalla de batalla: enruta por fase (lobby / cuenta atrás / en vivo / resultado). */
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { BattleProvider, useBattleContext } from '@/contexts/BattleContext'
import BattleLobby from '@/components/battle/BattleLobby'
import BattleCountdown from '@/components/battle/BattleCountdown'
import BattleLive from '@/components/battle/BattleLive'
import BattleResults from '@/components/battle/BattleResults'

function BattlePhaseRouter() {
  const { t } = useTranslation()
  const router = useRouter()
  const { phase, error, clearError, actions } = useBattleContext()

  // Un fallo de red al abrir la batalla dejaba la pantalla en "Cargando…" para siempre:
  // la suscripción solo se monta una vez por batalla y nadie la volvía a intentar. Tocar
  // el aviso reintenta, que es lo que cualquiera espera de un mensaje de error.
  const retry = () => {
    clearError()
    actions.refresh()
  }

  // La cuenta atrás y la sesión en vivo ocupan toda la pantalla: durante una ronda no
  // hay nada más que mirar, y un ScrollView invitaría a perder el ejercicio actual.
  if (phase === 'countdown') {
    return (
      <View className="flex-1 px-4">
        <BattleCountdown />
      </View>
    )
  }
  if (phase === 'live') {
    return (
      <View className="flex-1 px-4 pb-4 pt-2">
        <BattleLive />
      </View>
    )
  }

  return (
    <ScrollView contentContainerClassName="px-4 pb-10" className="flex-1">
      <View className="flex-row justify-end pt-2">
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-muted/60 p-2 active:opacity-70"
          accessibilityLabel={t('common.back')}
        >
          <X size={18} color="#888899" />
        </Pressable>
      </View>

      {error && (
        <Pressable
          onPress={retry}
          className="mb-3 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 active:opacity-70"
        >
          {/* `status === 0` es todo lo que ni siquiera llegó al servidor. El SDK de
              PocketBase lo rellena con su "Something went wrong.", en inglés y sin decir
              nada útil. El resto sí trae mensaje del servidor, más concreto que
              cualquier copy genérico nuestro. */}
          <Text className="text-xs text-red-400">
            {error.status === 0 ? t('battle.networkError') : error.message}
          </Text>
          <Text className="mt-1 font-mono text-[9px] uppercase tracking-[2px] text-red-400/70">
            {t('battle.retry')}
          </Text>
        </Pressable>
      )}

      {phase === 'loading' && (
        <View className="items-center py-16">
          <Text className="text-muted-foreground">{t('common.loading')}</Text>
        </View>
      )}
      {phase === 'not_found' && (
        <View className="items-center py-16">
          <Text className="font-bebas text-2xl text-muted-foreground">{t('battle.notFound')}</Text>
        </View>
      )}
      {phase === 'forbidden' && (
        <View className="items-center py-16">
          <Text className="font-bebas text-2xl text-muted-foreground">{t('battle.notFound')}</Text>
        </View>
      )}
      {(phase === 'draft' || phase === 'lobby') && <BattleLobby />}
      {(phase === 'finished' || phase === 'cancelled' || phase === 'expired') && <BattleResults />}
    </ScrollView>
  )
}

export default function BattleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  if (!id) return null

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BattleProvider battleId={id}>
        <BattlePhaseRouter />
      </BattleProvider>
    </SafeAreaView>
  )
}
