/**
 * AlarmPermissionCard — pide el permiso de alarmas exactas de Android en la
 * pantalla de descanso (PR #778).
 *
 * Sin él, el aviso de fin de descanso con la pantalla apagada llega tarde
 * (`training-alarm.ts`): Android 14+ no concede `SCHEDULE_EXACT_ALARM` al
 * instalar y solo se puede activar en Ajustes. Se pide aquí, donde el usuario
 * está a punto de bloquear el móvil, y no al arrancar. El estado se relee cada
 * vez que la app vuelve a primer plano (el usuario vuelve de Ajustes) y la
 * tarjeta desaparece sola al concederlo. Misma factura que `PushPermissionCard`.
 * Política pura (cuándo enseñarla, snooze) en `core/lib/alarm-prompt`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated'
import { AlarmClock } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'
import { COLORS } from '@/lib/theme'
import { getAlarmPermissionState, openAlarmPermissionSettings } from '@/lib/training-alarm'
import {
  getAlarmPromptDismissedAt,
  markAlarmPromptDismissed,
  shouldShowAlarmPrompt,
  trackAlarmPermissionResolved,
  trackAlarmPromptAnswered,
  trackAlarmPromptViewed,
} from '@calistenia/core/lib/alarm-prompt'

export default function AlarmPermissionCard() {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const viewedTracked = useRef(false)
  /** Se puso `true` al abrir Ajustes: al volver, el permiso se relee y se cuenta. */
  const awaitingSettings = useRef(false)

  const refresh = useCallback(async () => {
    const permission = await getAlarmPermissionState()
    if (awaitingSettings.current) {
      awaitingSettings.current = false
      trackAlarmPermissionResolved({ granted: permission === 'granted' })
    }
    const show = shouldShowAlarmPrompt({
      permission,
      dismissedAt: getAlarmPromptDismissedAt(),
      now: Date.now(),
    })
    setVisible(show)
    if (show && !viewedTracked.current) {
      viewedTracked.current = true
      trackAlarmPromptViewed()
    }
  }, [])

  useEffect(() => {
    void refresh()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh()
    })
    return () => { sub.remove() }
  }, [refresh])

  if (!visible) return null

  const handleAccept = () => {
    haptics.light()
    trackAlarmPromptAnswered({ result: 'opened_settings' })
    awaitingSettings.current = true
    void openAlarmPermissionSettings()
  }

  const handleDecline = () => {
    haptics.light()
    markAlarmPromptDismissed()
    trackAlarmPromptAnswered({ result: 'dismissed' })
    setVisible(false)
  }

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(400)}
      className="w-full max-w-[340px] rounded-xl border border-border bg-card p-4"
    >
      <View className="flex-row items-start gap-3">
        <View className="size-9 shrink-0 items-center justify-center rounded-full bg-lime/10">
          <AlarmClock size={16} color={COLORS.lime} />
        </View>
        <View className="flex-1">
          <Text className="font-sans-medium text-sm text-foreground">{t('alarmPrompt.title')}</Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">{t('alarmPrompt.desc')}</Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-end gap-2">
        <Pressable onPress={handleDecline} hitSlop={8} className="px-2 py-1.5">
          <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">
            {t('alarmPrompt.decline')}
          </Text>
        </Pressable>
        <Button size="sm" className="bg-lime active:bg-lime/90" onPress={handleAccept}>
          <Text className="font-sans-medium text-xs text-lime-foreground">{t('alarmPrompt.accept')}</Text>
        </Button>
      </View>
    </Animated.View>
  )
}
