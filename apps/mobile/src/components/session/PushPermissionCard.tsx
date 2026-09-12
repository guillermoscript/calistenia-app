/**
 * PushPermissionCard — oferta del permiso de notificaciones en la celebración
 * post-entreno (#694).
 *
 * Antes móvil lo pedía al arrancar (`init-core.ts`), sin contexto. Aquí el
 * usuario acaba de completar un entreno: el aviso tiene un porqué («no
 * pierdas la racha»). Se ofrece una sola vez por usuario y dispositivo
 * (`shouldShowPushPrompt`/`markPushPromptSeen` en `packages/core/lib/push-prompt`).
 */
import { useEffect, useRef, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated'
import { Bell } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { haptics } from '@/lib/haptics'
import { COLORS } from '@/lib/theme'
import { pb } from '@calistenia/core/lib/pocketbase'
import { getPushPermissionState, registerPushTokenAsync } from '@/lib/push-registration'
import {
  shouldShowPushPrompt,
  markPushPromptSeen,
  trackPushPromptViewed,
  trackPushPromptAnswered,
  type PushPermissionState,
  type PushPromptResult,
} from '@calistenia/core/lib/push-prompt'

interface PushPermissionCardProps {
  userId: string | null | undefined
  workoutKey: string
  totalSessions: number
}

const HIDE_DELAY_MS = 2500

export default function PushPermissionCard({ userId, workoutKey, totalSessions }: PushPermissionCardProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const [result, setResult] = useState<PushPromptResult | null>(null)
  const viewedTracked = useRef(false)

  useEffect(() => {
    let cancelled = false
    getPushPermissionState().then((permission: PushPermissionState) => {
      if (cancelled) return
      const show = shouldShowPushPrompt({ userId, permission })
      setVisible(show)
      if (show && !viewedTracked.current) {
        viewedTracked.current = true
        trackPushPromptViewed({ workoutKey, totalSessions })
      }
    })
    return () => { cancelled = true }
  }, [userId, workoutKey, totalSessions])

  if (!visible || !userId) return null

  const finish = (r: PushPromptResult) => {
    markPushPromptSeen(userId)
    trackPushPromptAnswered({ result: r, workoutKey })
    setResult(r)
    setTimeout(() => setVisible(false), HIDE_DELAY_MS)
  }

  const handleAccept = async () => {
    haptics.light()
    const token = await registerPushTokenAsync(pb, userId, { requestPermission: true })
    finish(token ? 'granted' : 'denied')
  }

  const handleDecline = () => {
    haptics.light()
    finish('dismissed')
  }

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(400)}
      className="mt-6 w-full max-w-[380px] rounded-xl border border-border bg-card p-4"
    >
      <View className="flex-row items-start gap-3">
        <View className="size-9 shrink-0 items-center justify-center rounded-full bg-lime/10">
          <Bell size={16} color={COLORS.lime} />
        </View>
        <View className="flex-1">
          <Text className="font-sans-medium text-sm text-foreground">{t('pushPrompt.title')}</Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">{t('pushPrompt.desc')}</Text>
        </View>
      </View>

      {result ? (
        <Text className="mt-3 text-center text-xs text-muted-foreground">
          {result === 'granted' ? t('pushPrompt.granted') : t('pushPrompt.denied')}
        </Text>
      ) : (
        <View className="mt-3 flex-row items-center justify-end gap-2">
          <Pressable onPress={handleDecline} hitSlop={8} className="px-2 py-1.5">
            <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">
              {t('pushPrompt.decline')}
            </Text>
          </Pressable>
          <Button size="sm" className="bg-lime active:bg-lime/90" onPress={handleAccept}>
            <Text className="font-sans-medium text-xs text-lime-foreground">{t('pushPrompt.accept')}</Text>
          </Button>
        </View>
      )}
    </Animated.View>
  )
}
