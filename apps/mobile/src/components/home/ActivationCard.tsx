/**
 * ActivationCard — objetivo «3 entrenos en tus primeros 7 días» en el Home (#800).
 *
 * Los estados los decide `activationCardMode` en core. Aquí se pintan
 * `progress` (1/3, 2/3 y los días que quedan) y `completed` (solo el día en
 * que se alcanza). El estado 0/3 NO se pinta aquí: con 0 sesiones el Home ya
 * enseña `FirstWorkoutCard`, que lleva la meta en una línea — así no hay dos
 * tarjetas de «primer entreno» ni se duplica su lógica. Tampoco tiene
 * «Ocultar»: desaparece sola al cerrarse la ventana de 7 días.
 *
 * Quien emite `activation_reached` es este componente, así que se monta
 * siempre en el Home aunque no pinte nada.
 */
import React from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { ACTIVATION_TARGET_SESSIONS } from '@calistenia/core/lib/activation'
import { useActivation, useTrackActivationReached } from '@calistenia/core/hooks/useActivation'

interface ActivationCardProps {
  userId: string | null
  /** `users.created` del usuario autenticado. */
  created: string | null | undefined
  doneDates: readonly string[]
}

function ActivationCard({ userId, created, doneDates }: ActivationCardProps) {
  const { t } = useTranslation()
  const activation = useActivation(created, doneDates)
  useTrackActivationReached(userId, activation)

  const { mode, daysRemaining } = activation
  if (mode !== 'progress' && mode !== 'completed') return null

  const done = Math.min(activation.sessionsInFirst7Days, ACTIVATION_TARGET_SESSIONS)
  const completed = mode === 'completed'

  return (
    <View
      className={cn('rounded-xl border p-4', completed ? 'border-lime/40 bg-lime/5' : 'border-border bg-card')}
      accessible
      accessibilityLabel={`${t('activation.title')}. ${t('activation.a11yProgress', { done, total: ACTIVATION_TARGET_SESSIONS })}`}
    >
      <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
        {t('activation.kicker')}
      </Text>
      <View className="mt-1 flex-row items-baseline justify-between gap-3">
        <Text className={cn('flex-1 font-bebas text-xl leading-none', completed ? 'text-lime' : 'text-foreground')}>
          {completed ? t('activation.completedTitle') : t('activation.title')}
        </Text>
        <Text className="font-bebas text-xl leading-none text-foreground">
          {done}<Text className="font-bebas text-xl leading-none text-muted-foreground">/{ACTIVATION_TARGET_SESSIONS}</Text>
        </Text>
      </View>
      <View className="mt-3 flex-row gap-1.5">
        {Array.from({ length: ACTIVATION_TARGET_SESSIONS }, (_, i) => (
          <View key={i} className={cn('h-1.5 flex-1 rounded-full', i < done ? 'bg-lime' : 'bg-muted')} />
        ))}
      </View>
      <Text className="mt-2 text-xs text-muted-foreground">
        {completed ? t('activation.completedDesc') : t('activation.progressDesc', { count: daysRemaining })}
      </Text>
    </View>
  )
}

export default React.memo(ActivationCard)
