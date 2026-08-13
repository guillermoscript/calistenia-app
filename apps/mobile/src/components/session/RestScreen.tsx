/**
 * Descanso de la sesión de fuerza.
 *
 * Ya no cuenta ni dibuja: la cuenta la lleva `useCountdown` y los píxeles `RestPanel`.
 * Lo que queda aquí es lo que de verdad es de la sesión — la notificación local de fin
 * de descanso, la notificación persistente en vivo, el ejercicio siguiente y el
 * descanso guardado por ejercicio. La batalla usa el mismo `RestPanel` sin heredar
 * nada de esto.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, AppState } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { scheduleRestEnd, cancelScheduled } from '@/lib/notifications'
import { updateLiveRest, liveSessionHandlesRest } from '@/lib/live-session'
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
  savedRest?: number
  onAdjust?: (exerciseId: string, seconds: number) => void
}

export function RestScreen({
  seconds: defaultSeconds,
  exerciseId,
  nextStep,
  onSkip,
  savedRest,
  onAdjust,
}: RestScreenProps) {
  const { t } = useTranslation()
  const initialSeconds = savedRest || defaultSeconds

  // La sesión es dueña de su ventana de descanso; `useCountdown` solo la lee.
  const [window, setWindow] = useState<CountdownWindow>(() => ({
    endAt: Date.now() + initialSeconds * 1000,
    totalSeconds: initialSeconds,
  }))
  const notifIdRef = useRef<string | null>(null)
  const nextStepRef = useRef(nextStep)
  nextStepRef.current = nextStep

  /** Texto de la notificación de fin de descanso. */
  const notifBody = useCallback(() => {
    const step = nextStepRef.current
    return step
      ? `${step.exercise.name} — ${t('notify.setOf', { set: step.setNumber, total: step.totalSets })}`
      : t('notify.prepareForNext')
    // `t` cambia de identidad al cambiar de idioma; no queremos reprogramar por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scheduleEnd = useCallback((endAt: number) => {
    // En Android nativo el cronómetro de la notificación persistente ya avisa del fin
    // del descanso — la puntual sería redundante.
    if (liveSessionHandlesRest()) return
    void scheduleRestEnd(
      Math.ceil((endAt - Date.now()) / 1000),
      t('notify.letsGo'),
      notifBody(),
    ).then((id) => { notifIdRef.current = id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifBody])

  useEffect(() => {
    restCues('start')
    scheduleEnd(window.endAt)
    updateLiveRest(window.endAt)
    return () => { cancelScheduled(notifIdRef.current) }
    // Solo al montar: SessionView remonta esta pantalla en cada descanso (`key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Saltar a mano cancela la notificación programada; ya no hay nada que anunciar. */
  const handleSkip = useCallback(() => {
    cancelScheduled(notifIdRef.current)
    onSkip()
  }, [onSkip])

  /**
   * Terminar de forma natural NO la cancela: la notificación vence en ese mismo
   * instante y cancelarla sería una carrera con el sistema. De ella se encarga la
   * limpieza al desmontar, que es lo que ocurre justo después.
   */
  const handleComplete = useCallback(() => { onSkip() }, [onSkip])

  const { secondsLeft, progress, resync } = useCountdown({
    endAt: window.endAt,
    totalSeconds: window.totalSeconds,
    onCue: restCues,
    onComplete: handleComplete,
    // Estable a propósito: ajustar el descanso alarga la cuenta, no la rearma, así que
    // el aviso de los 10 s sigue sonando una sola vez como hasta ahora.
    resetKey: 'rest',
  })

  // Volver de segundo plano: mirar el reloj ya, sin esperar al siguiente intervalo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resync()
    })
    return () => { sub.remove() }
  }, [resync])

  const windowRef = useRef(window)
  windowRef.current = window

  const handleAdjust = useCallback((delta: number) => {
    // Fuera del updater de `setWindow`: reprogramar la notificación es un efecto, y un
    // updater se ejecuta dos veces en modo estricto.
    const next = adjustCountdown(windowRef.current, delta, Date.now())
    setWindow(next)
    cancelScheduled(notifIdRef.current)
    scheduleEnd(next.endAt)
    updateLiveRest(next.endAt)
    if (exerciseId && onAdjust) onAdjust(exerciseId, next.totalSeconds)
  }, [exerciseId, onAdjust, scheduleEnd])

  return (
    <View className="flex-1 items-center justify-center">
      <RestPanel
        secondsLeft={secondsLeft}
        progress={progress}
        endAt={window.endAt}
        label={t('session.resting')}
        skipLabel={t('session.skipRest')}
        onSkip={handleSkip}
        adjustDeltas={ADJUST_DELTAS}
        onAdjust={handleAdjust}
      >
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
      </RestPanel>
    </View>
  )
}
