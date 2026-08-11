/**
 * Cuenta atrás sincronizada.
 *
 * El número sale de `starts_at` del servidor corregido con el offset medido, nunca del
 * reloj del dispositivo: dos móviles con relojes distintos tienen que ver el mismo 3-2-1.
 */
import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'
import { useBattleContext } from '@/contexts/BattleContext'

export default function BattleCountdown() {
  const { t } = useTranslation()
  const { secondsToStart, snapshot } = useBattleContext()

  // Un toque por segundo, sin repetir si el intervalo dispara dos veces en el mismo.
  const lastTickRef = useRef<number | null>(null)
  useEffect(() => {
    if (secondsToStart <= 0 || secondsToStart > 3) return
    if (lastTickRef.current === secondsToStart) return
    lastTickRef.current = secondsToStart
    void haptics.light()
  }, [secondsToStart])

  const participants = snapshot?.participants.filter((p) => p.status === 'active').length ?? 0

  return (
    <View className="flex-1 items-center justify-center gap-6">
      <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
        {t('battle.getReady')}
      </Text>
      <Text className="font-bebas text-[120px] leading-none text-lime">
        {secondsToStart}
      </Text>
      <Text className="font-mono text-[11px] uppercase tracking-[2px] text-muted-foreground">
        {participants} {t('battle.participants')}
      </Text>
    </View>
  )
}
