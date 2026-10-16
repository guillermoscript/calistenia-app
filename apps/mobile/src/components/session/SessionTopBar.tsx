import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ListChecks, X } from 'lucide-react-native'
import type { SessionPhase } from '@calistenia/core/lib/session-machine'

import { Text } from '@/components/ui/text'
import { LIME, MUTED } from '@/components/session/constants'

interface SessionTopBarProps {
  phase: SessionPhase
  /** Nombre del ejercicio en curso, si la fase lo muestra. */
  exerciseName?: string
  /** Posición 1-based del ejercicio actual y total de ejercicios. */
  exerciseIndex: number
  exerciseTotal: number
  /** Posición 1-based del paso actual y total de pasos. */
  stepIndex: number
  stepTotal: number
  onBack: () => void
  onDiscard: () => void
  /** Abre la lista de ejercicios; si falta, el contador no es pulsable. */
  onOpenList?: () => void
  /** Sale solo mientras se está en el calentamiento. */
  onSkipWarmup?: () => void
  /** Sale solo mientras se está en el enfriamiento. */
  onSkipCooldown?: () => void
}

/** Cabecera de la sesión: volver, título de la fase, contadores, progreso y saltos de sección. */
export default function SessionTopBar({
  phase,
  exerciseName,
  exerciseIndex,
  exerciseTotal,
  stepIndex,
  stepTotal,
  onBack,
  onDiscard,
  onOpenList,
  onSkipWarmup,
  onSkipCooldown,
}: SessionTopBarProps) {
  const { t } = useTranslation()

  return (
    <View>
      <View className="h-[52px] flex-row items-center justify-between px-2">
        <Pressable onPress={onBack} hitSlop={8} className="min-h-[44px] min-w-[44px] items-center justify-center" accessibilityLabel={t('common.back')}>
          <ChevronLeft size={22} color={MUTED} />
        </Pressable>

        <Pressable
          onPress={onOpenList}
          disabled={!onOpenList}
          hitSlop={4}
          className="min-h-[44px] flex-1 items-center justify-center px-2 active:opacity-70"
          accessibilityLabel={t('session.exerciseListOpen')}
        >
          <Text className="font-mono text-[10px] tracking-[2px] text-muted-foreground" numberOfLines={1}>
            {phase === 'exercise' && exerciseName ? exerciseName.toUpperCase()
              : phase === 'rest' ? t('session.resting').toUpperCase()
              : phase === 'note' ? t('warmupCooldown.history.completed').toUpperCase()
              : ''}
          </Text>
          {onOpenList ? (
            // Chip en lima (= interactivo): con texto de 9 px gris nadie veía
            // que el contador abre la lista de ejercicios.
            <View className="mt-1 flex-row items-center gap-1.5 rounded-full border border-lime/40 bg-lime/10 px-2.5 py-[3px]">
              <ListChecks size={13} color={LIME} />
              <Text className="font-mono text-[11px] tabular-nums text-lime">
                {exerciseIndex}/{exerciseTotal}
              </Text>
              <Text className="font-mono text-[10px] tabular-nums text-muted-foreground">
                · {stepIndex}/{stepTotal}
              </Text>
            </View>
          ) : (
            <Text className="font-mono text-[9px] tabular-nums text-muted-foreground/60">
              {exerciseIndex}/{exerciseTotal} · {stepIndex}/{stepTotal}
            </Text>
          )}
        </Pressable>

        <Pressable onPress={onDiscard} hitSlop={8} className="min-h-[44px] min-w-[44px] items-center justify-center" accessibilityLabel={t('session.discardTitle')}>
          <X size={20} color={MUTED} />
        </Pressable>
      </View>

      {/* Barra de progreso */}
      <View className="h-[3px] bg-muted">
        <View
          className="h-full rounded-r-full bg-lime"
          style={{ width: `${(stepIndex / stepTotal) * 100}%` }}
        />
      </View>

      {/* Saltar sección */}
      {onSkipWarmup && (
        <Pressable onPress={onSkipWarmup} className="items-center border-b border-border py-1.5">
          <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{t('warmupCooldown.skip.warmup')}</Text>
        </Pressable>
      )}
      {onSkipCooldown && (
        <Pressable onPress={onSkipCooldown} className="items-center border-b border-border py-1.5">
          <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{t('warmupCooldown.skip.remaining')}</Text>
        </Pressable>
      )}
    </View>
  )
}
