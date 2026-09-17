/**
 * Descanso de la sesión de fuerza.
 *
 * Ya no cuenta ni dibuja: la cuenta la lleva `useCountdown` y los píxeles `RestPanel`.
 * Lo que queda aquí es lo que de verdad es de la sesión — el aviso de fin de descanso,
 * la notificación persistente en vivo, el ejercicio siguiente y el descanso guardado
 * por ejercicio. La batalla usa el mismo `RestPanel` sin heredar nada de esto.
 *
 * El aviso de fin de descanso tiene DOS vías y solo puede sonar una: con la app
 * delante lo toca `restCues` y con la app detrás lo da la alarma del sistema
 * (`training-alarm`), que es la única que sigue viva cuando Android congela el
 * proceso. De elegir cuál manda se encarga `useTrainingAlarm` / `useTrainingCues`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, AppState } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import AlarmPermissionCard from '@/components/session/AlarmPermissionCard'
import { cancelTrainingAlarm } from '@/lib/training-alarm'
import { useTrainingAlarm, useTrainingCues } from '@/lib/use-training-alarm'
import { updateLiveRest } from '@/lib/live-session'
import { restCues } from '@/lib/training-cues'
import { RestPanel } from '@/components/training/RestPanel'
import type { Step } from '@/components/session/types'
import { useCountdown } from '@calistenia/core/hooks/useCountdown'
import { adjustCountdown, type CountdownWindow } from '@calistenia/core/lib/countdown'

/** Los mismos ajustes de siempre. */
const ADJUST_DELTAS = [-15, 15, 30] as const

interface RestScreenProps {
  seconds: number
  exerciseId?: string
  nextStep: Step | null
  onSkip: () => void
  /**
   * Solo el corte MANUAL del descanso. El que se agota solo llama a `onSkip`
   * pero NO a esto: sin la distinción, `rest_skipped` contaría cada descanso
   * completado como saltado (#636 §3).
   */
  onManualSkip?: (secondsRemaining: number) => void
  savedRest?: number
  onAdjust?: (exerciseId: string, seconds: number) => void
}

export function RestScreen({
  seconds: defaultSeconds,
  exerciseId,
  nextStep,
  onSkip,
  onManualSkip,
  savedRest,
  onAdjust,
}: RestScreenProps) {
  const { t } = useTranslation()
  const initialSeconds = savedRest || defaultSeconds

  // La sesión es dueña de su ventana de descanso; `useCountdown` solo la lee.
  const [restWindow, setRestWindow] = useState<CountdownWindow>(() => ({
    endAt: Date.now() + initialSeconds * 1000,
    totalSeconds: initialSeconds,
  }))
  const nextStepRef = useRef(nextStep)
  nextStepRef.current = nextStep

  /** Texto de la alarma de fin de descanso, leído en el momento de armarla. */
  const alarmText = useCallback(() => {
    const step = nextStepRef.current
    return {
      title: t('notify.letsGo'),
      body: step
        ? `${step.exercise.name} — ${t('notify.setOf', { set: step.setNumber, total: step.totalSets })}`
        : t('notify.prepareForNext'),
    }
    // `t` cambia de identidad al cambiar de idioma; no queremos reprogramar por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cues = useTrainingCues(restCues)
  useTrainingAlarm({ kind: 'rest', endAt: restWindow.endAt, text: alarmText })

  useEffect(() => {
    restCues('start')
    updateLiveRest(restWindow.endAt)
    // Solo al montar: SessionView remonta esta pantalla en cada descanso (`key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El contador se declara más abajo, así que el segundero viaja por una ref:
  // `handleSkip` tiene que seguir siendo estable.
  const secondsLeftRef = useRef(0)
  const onManualSkipRef = useRef(onManualSkip)
  onManualSkipRef.current = onManualSkip

  /** Saltar a mano desarma la alarma: ya no hay nada que anunciar. */
  const handleSkip = useCallback(() => {
    void cancelTrainingAlarm('rest')
    onManualSkipRef.current?.(secondsLeftRef.current)
    onSkip()
  }, [onSkip])

  /**
   * Terminar de forma natural NO la desarma: la alarma vence en ese mismo instante
   * y cancelarla sería una carrera con el sistema — con la app detrás es justo la
   * que tiene que sonar. De eso se encarga `useTrainingAlarm`.
   */
  const handleComplete = useCallback(() => { onSkip() }, [onSkip])

  const { secondsLeft, progress, resync } = useCountdown({
    endAt: restWindow.endAt,
    totalSeconds: restWindow.totalSeconds,
    onCue: cues,
    onComplete: handleComplete,
    // Estable a propósito: ajustar el descanso alarga la cuenta, no la rearma, así que
    // el aviso de los 10 s sigue sonando una sola vez como hasta ahora.
    resetKey: 'rest',
  })
  secondsLeftRef.current = secondsLeft

  // Volver de segundo plano: mirar el reloj ya, sin esperar al siguiente intervalo.
  // (De armar y desarmar la alarma se encarga `useTrainingAlarm`.)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resync()
    })
    return () => { sub.remove() }
  }, [resync])

  const windowRef = useRef(restWindow)
  windowRef.current = restWindow

  const handleAdjust = useCallback((delta: number) => {
    // Fuera del updater de `setWindow`: reprogramar la notificación es un efecto, y un
    // updater se ejecuta dos veces en modo estricto.
    const next = adjustCountdown(windowRef.current, delta, Date.now())
    setRestWindow(next)
    // La alarma la rearma `useTrainingAlarm` al ver el `endAt` nuevo.
    updateLiveRest(next.endAt)
    if (exerciseId && onAdjust) onAdjust(exerciseId, next.totalSeconds)
  }, [exerciseId, onAdjust])

  return (
    <View className="flex-1 items-center justify-center">
      <RestPanel
        secondsLeft={secondsLeft}
        progress={progress}
        endAt={restWindow.endAt}
        label={t('session.resting')}
        skipLabel={t('session.skipRest')}
        onSkip={handleSkip}
        adjustDeltas={ADJUST_DELTAS}
        onAdjust={handleAdjust}
      >
        <View className="w-full items-center gap-3">
        {nextStep ? (
          <View className="w-full max-w-[340px] rounded-xl border border-border bg-card px-4 py-3.5">
            <Text className="mb-2 font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
              {t('notify.prepareForNext')}
            </Text>
            <Text className="mb-1 font-sans-medium text-[15px] text-foreground">
              {nextStep.exercise.name}
            </Text>
            <Text className="font-mono text-xs text-lime">
              {nextStep.exercise.reps}
              <Text className="font-mono text-[11px] text-muted-foreground">
                {'  '}· {t('session.set')} {nextStep.setNumber}/{nextStep.totalSets}
              </Text>
            </Text>
            <Text className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground">
              {nextStep.exercise.muscles}
            </Text>
          </View>
        ) : null}
        {/* Android sin permiso de alarma exacta: el aviso con la pantalla apagada
            llegaría tarde. Se pide aquí, justo antes de bloquear el móvil. */}
        <AlarmPermissionCard />
        </View>
      </RestPanel>
    </View>
  )
}
