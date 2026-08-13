/**
 * Cuenta atrás por marca de tiempo — lógica pura del descanso y del temporizador.
 *
 * Se cuenta contra un instante de fin (`endAt`) y no restando de un contador, para que
 * la cuenta sobreviva a que la app se vaya a segundo plano: al volver basta con mirar
 * el reloj. El "reloj" es un parámetro, no `Date.now()` directamente, porque una
 * batalla debe contar contra la hora corregida del servidor (`serverNow`) mientras que
 * una sesión en solitario cuenta contra la del dispositivo.
 *
 * Aquí no hay sonidos ni hápticas: este módulo solo decide QUÉ señal toca en cada
 * frontera de segundo. Quién la convierte en un pitido es cosa de la plataforma.
 */

/** Señal audible/háptica que el entreno puede pedir. La traduce cada plataforma. */
export type TrainingCue =
  /** Arranque del descanso. */
  | 'start'
  /** Uno de los pasos del "prepárate" 3-2-1. */
  | 'precount'
  /** Quedan pocos segundos: aviso único. */
  | 'warning'
  /** Tic de los últimos segundos. */
  | 'tick'
  /** Se acabó. */
  | 'complete'

/** Señales que puede emitir una cuenta atrás al cruzar una frontera de segundo. */
export type CountdownCue = Extract<TrainingCue, 'warning' | 'tick' | 'complete'>

export interface CountdownCueThresholds {
  /** Segundo al cruzar el cual (bajando) se emite el aviso. */
  warnAt: number
  /** Desde este segundo hacia abajo, cada segundo emite un tic. */
  tickFrom: number
}

/** Umbrales del descanso entre series (`RestScreen` histórico). */
export const REST_CUE_THRESHOLDS: CountdownCueThresholds = { warnAt: 10, tickFrom: 3 }

/** Umbrales del ejercicio por tiempo. Avisa un segundo antes que el descanso. */
export const TIMER_CUE_THRESHOLDS: CountdownCueThresholds = { warnAt: 11, tickFrom: 3 }

export interface CountdownWindow {
  /** Instante de fin, en ms de la misma escala que el reloj que se le pase. */
  endAt: number
  /** Duración total, para poder dibujar el progreso. */
  totalSeconds: number
}

/** Segundos que faltan, redondeados hacia arriba y nunca negativos. */
export function secondsLeft(endAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endAtMs - nowMs) / 1000))
}

/** Fracción de la cuenta que queda por consumir, en [0, 1]. */
export function countdownProgress(remainingSeconds: number, totalSeconds: number): number {
  if (!(totalSeconds > 0)) return 0
  return Math.max(0, Math.min(1, remainingSeconds / totalSeconds))
}

/** `m:ss`. Los minutos no se rellenan con cero — un descanso son 1:30, no 01:30. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Qué señales tocan al pasar de `prev` a `next` segundos restantes.
 *
 * Solo mira la transición, así que no dispara nada mientras el segundo no cambie —
 * es lo que permite llamarla desde un intervalo de 250 ms sin repetir avisos. Emitir
 * la misma señal dos veces (p. ej. si se añade tiempo y se vuelve a cruzar el umbral)
 * es decisión de quien la consume, no de esta función.
 */
export function countdownCues(
  prevSeconds: number,
  nextSeconds: number,
  thresholds: CountdownCueThresholds = REST_CUE_THRESHOLDS,
): CountdownCue[] {
  if (nextSeconds === prevSeconds) return []
  const cues: CountdownCue[] = []

  if (prevSeconds > thresholds.warnAt && nextSeconds <= thresholds.warnAt && nextSeconds > 0) {
    cues.push('warning')
  }
  // Solo al descontar de uno en uno: si la cuenta pega un salto (volver de segundo
  // plano) no tiene sentido soltar los tics de golpe.
  if (nextSeconds > 0 && nextSeconds <= thresholds.tickFrom && prevSeconds === nextSeconds + 1) {
    cues.push('tick')
  }
  if (nextSeconds <= 0 && prevSeconds > 0) cues.push('complete')

  return cues
}

export interface CountdownRunnerOptions {
  thresholds?: CountdownCueThresholds
  /**
   * Si el aviso suena una sola vez por cuenta. Con `false`, alargar el descanso por
   * encima del umbral hace que vuelva a avisar al cruzarlo.
   */
  warnOnce?: boolean
}

export interface CountdownStep {
  secondsLeft: number
  /** Si el segundo que se muestra ha cambiado respecto al paso anterior. */
  changed: boolean
  /** Señales ya filtradas: el aviso y el fin no se repiten. */
  cues: CountdownCue[]
}

export interface CountdownRunner {
  /** Mira el reloj y devuelve qué ha pasado desde el paso anterior. */
  step(endAtMs: number, nowMs: number): CountdownStep
  /** Rearma la cuenta: el aviso y el fin vuelven a estar disponibles. */
  reset(secondsLeft: number): void
  /** El último segundo conocido, sin volver a mirar el reloj. */
  current(): number
}

/**
 * El estado de una cuenta atrás en marcha, fuera de React.
 *
 * Lo que hace peligroso a un temporizador no es la aritmética —eso es
 * `countdownCues`— sino el "solo una vez": que el aviso de los 10 s no suene dos veces
 * si alargas el descanso, y que el fin no dispare dos veces el salto al siguiente
 * ejercicio. Eso vivía en tres `useRef` dentro del componente, donde no se puede
 * probar sin renderizar React, cosa que este repo no puede hacer.
 *
 * Al ser una fábrica con estado interno se puede simular una cuenta entera tick a tick
 * en un test, que es exactamente lo que hace `countdown.test.ts`.
 */
export function createCountdownRunner(
  initialSeconds: number,
  options: CountdownRunnerOptions = {},
): CountdownRunner {
  const { thresholds = REST_CUE_THRESHOLDS, warnOnce = true } = options
  let last = Math.max(0, initialSeconds)
  let warned = false
  let finished = false

  return {
    step(endAtMs, nowMs) {
      const left = secondsLeft(endAtMs, nowMs)
      const changed = left !== last
      const cues: CountdownCue[] = []

      if (changed) {
        for (const cue of countdownCues(last, left, thresholds)) {
          if (cue === 'warning') {
            if (warnOnce && warned) continue
            warned = true
          }
          if (cue === 'complete') {
            if (finished) continue
            finished = true
          }
          cues.push(cue)
        }
        last = left
      }

      // Una cuenta que nace ya vencida no cruza ninguna frontera, pero ha terminado.
      if (left <= 0 && !finished) {
        finished = true
        cues.push('complete')
      }

      return { secondsLeft: left, changed, cues }
    },
    reset(secondsLeft) {
      last = Math.max(0, secondsLeft)
      warned = false
      finished = false
    },
    current() {
      return last
    },
  }
}

/**
 * Alarga o acorta una cuenta atrás en marcha.
 *
 * El total se recorta al mínimo, y el instante de fin se mueve **el delta que de
 * verdad se ha podido aplicar**: si el total ya está en el mínimo, restar más no puede
 * seguir adelantando el final (que era el hueco de la versión anterior, donde el
 * restante caía por debajo del total y el anillo se quedaba en cero).
 */
export function adjustCountdown(
  window: CountdownWindow,
  deltaSeconds: number,
  nowMs: number,
  minTotalSeconds = 10,
): CountdownWindow {
  const totalSeconds = Math.max(minTotalSeconds, window.totalSeconds + deltaSeconds)
  const applied = totalSeconds - window.totalSeconds
  // Nunca por debajo de un segundo: acortar no debe cerrar el descanso de golpe.
  const endAt = Math.max(nowMs + 1000, window.endAt + applied * 1000)
  return { endAt, totalSeconds }
}
