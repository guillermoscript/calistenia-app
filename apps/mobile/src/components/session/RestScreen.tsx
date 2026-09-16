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
 * (`rest-alarm`), que es la única que sigue viva cuando Android congela el proceso.
 * Quién manda en cada momento lo decide `rest-alarm-policy`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, AppState, type AppStateStatus } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cancelRestAlarm, scheduleRestAlarm } from '@/lib/rest-alarm'
import { restAlarmAction, shouldCancelOnLeave } from '@/lib/rest-alarm-policy'
import { updateLiveRest } from '@/lib/live-session'
import { restCues } from '@/lib/training-cues'
import { RestPanel } from '@/components/training/RestPanel'
import type { Step } from '@/components/session/types'
import { useCountdown } from '@calistenia/core/hooks/useCountdown'
import { adjustCountdown, type CountdownWindow, type TrainingCue } from '@calistenia/core/lib/countdown'

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
  /** Fin del descanso en curso, legible desde callbacks estables. */
  const endAtRef = useRef(restWindow.endAt)
  endAtRef.current = restWindow.endAt
  /** ¿Hay alarma del sistema programada ahora mismo? */
  const armedRef = useRef(false)

  /** Texto de la notificación de fin de descanso. */
  const notifBody = useCallback(() => {
    const step = nextStepRef.current
    return step
      ? `${step.exercise.name} — ${t('notify.setOf', { set: step.setNumber, total: step.totalSets })}`
      : t('notify.prepareForNext')
    // `t` cambia de identidad al cambiar de idioma; no queremos reprogramar por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Arma o desarma la alarma del sistema según dónde esté la app: delante suena el
   * «vamos» de `restCues`, detrás (o con el proceso ya congelado) solo puede sonar
   * el sistema. Nunca las dos — la política vive en `rest-alarm-policy`.
   */
  const syncAlarm = useCallback((state: AppStateStatus = AppState.currentState) => {
    const action = restAlarmAction(
      state === 'active',
      endAtRef.current - Date.now(),
      armedRef.current,
    )
    if (action === 'arm') {
      armedRef.current = true
      void scheduleRestAlarm(endAtRef.current, t('notify.letsGo'), notifBody())
    } else if (action === 'disarm') {
      armedRef.current = false
      void cancelRestAlarm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifBody])

  useEffect(() => {
    restCues('start')
    syncAlarm()
    updateLiveRest(restWindow.endAt)
    return () => {
      // Al salir solo se cancela si de verdad queda descanso (salto manual, cerrar la
      // sesión). La que está venciendo se deja sonar: con la app detrás es el único
      // aviso que hay, y cancelarla aquí era justo lo que lo silenciaba.
      if (armedRef.current && shouldCancelOnLeave(endAtRef.current - Date.now())) {
        void cancelRestAlarm()
      }
    }
    // Solo al montar: SessionView remonta esta pantalla en cada descanso (`key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * El «vamos» de la app solo si está delante. Detrás lo da la alarma del sistema
   * y sonarían los dos (o, con el proceso congelado, ninguno de los dos aquí).
   */
  const handleCue = useCallback((cue: TrainingCue) => {
    if (cue === 'complete' && AppState.currentState !== 'active') return
    restCues(cue)
  }, [])

  // El contador se declara más abajo, así que el segundero viaja por una ref:
  // `handleSkip` tiene que seguir siendo estable.
  const secondsLeftRef = useRef(0)
  const onManualSkipRef = useRef(onManualSkip)
  onManualSkipRef.current = onManualSkip

  /** Saltar a mano desarma la alarma: ya no hay nada que anunciar. */
  const handleSkip = useCallback(() => {
    armedRef.current = false
    void cancelRestAlarm()
    onManualSkipRef.current?.(secondsLeftRef.current)
    onSkip()
  }, [onSkip])

  /**
   * Terminar de forma natural NO la desarma: la alarma vence en ese mismo instante
   * y cancelarla sería una carrera con el sistema. De ella se encarga la limpieza
   * al desmontar, que es lo que ocurre justo después.
   */
  const handleComplete = useCallback(() => { onSkip() }, [onSkip])

  const { secondsLeft, progress, resync } = useCountdown({
    endAt: restWindow.endAt,
    totalSeconds: restWindow.totalSeconds,
    onCue: handleCue,
    onComplete: handleComplete,
    // Estable a propósito: ajustar el descanso alarga la cuenta, no la rearma, así que
    // el aviso de los 10 s sigue sonando una sola vez como hasta ahora.
    resetKey: 'rest',
  })
  secondsLeftRef.current = secondsLeft

  // Irse a segundo plano arma la alarma del sistema; volver la desarma y mira el
  // reloj ya, sin esperar al siguiente intervalo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resync()
      syncAlarm(state)
    })
    return () => { sub.remove() }
  }, [resync, syncAlarm])

  const windowRef = useRef(restWindow)
  windowRef.current = restWindow

  const handleAdjust = useCallback((delta: number) => {
    // Fuera del updater de `setWindow`: reprogramar la notificación es un efecto, y un
    // updater se ejecuta dos veces en modo estricto.
    const next = adjustCountdown(windowRef.current, delta, Date.now())
    setRestWindow(next)
    // La ref antes de `syncAlarm`: ajustar es una acción de la app en primer plano,
    // así que lo normal es que no haya alarma que rearmar, pero el nuevo `endAt`
    // manda igual.
    endAtRef.current = next.endAt
    if (armedRef.current) {
      armedRef.current = false
      void cancelRestAlarm()
    }
    syncAlarm()
    updateLiveRest(next.endAt)
    if (exerciseId && onAdjust) onAdjust(exerciseId, next.totalSeconds)
  }, [exerciseId, onAdjust, syncAlarm])

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
