/**
 * Sonidos del workout — misma paleta que apps/web/src/lib/sounds.ts pero con
 * WAVs pregenerados (scripts/generate-sounds.mjs) via expo-audio: RN no tiene
 * Web Audio API. Todos son fire-and-forget y nunca lanzan.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'

const SOURCES = {
  restStart: require('../../assets/sounds/rest-start.wav'),
  getReady: require('../../assets/sounds/get-ready.wav'),
  countdownTick: require('../../assets/sounds/countdown-tick.wav'),
  warning: require('../../assets/sounds/warning.wav'),
  setComplete: require('../../assets/sounds/set-complete.wav'),
  sessionComplete: require('../../assets/sounds/session-complete.wav'),
  timerComplete: require('../../assets/sounds/timer-complete.wav'),
} as const

type SoundName = keyof typeof SOURCES

const players = new Map<SoundName, AudioPlayer>()
let modeConfigured = false

function play(name: SoundName): void {
  try {
    if (!modeConfigured) {
      modeConfigured = true
      // Sonar aunque el iPhone esté en silencio (es un timer de entrenamiento)
      // y mezclarse con la música del usuario en vez de pausarla.
      setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        interruptionModeAndroid: 'duckOthers',
      }).catch(() => {})
    }
    let player = players.get(name)
    if (!player) {
      player = createAudioPlayer(SOURCES[name])
      players.set(name, player)
    }
    player.seekTo(0)
    player.play()
  } catch {
    // sin audio no se rompe la sesión
  }
}

/** Chime descendente suave — empieza el descanso */
export const playRestStart = (): void => play('restStart')
/** Tonos ascendentes — fin del descanso, prepárate */
export const playGetReady = (): void => play('getReady')
/** Tick corto — cuenta atrás 3, 2, 1 */
export const playCountdownTick = (): void => play('countdownTick')
/** Doble pulso — quedan 10 segundos */
export const playWarning = (): void => play('warning')
/** Ding — serie registrada */
export const playSetComplete = (): void => play('setComplete')
/** Fanfarria — sesión completada */
export const playSessionComplete = (): void => play('sessionComplete')
/** Triple beep — ejercicio de tiempo terminado */
export const playTimerComplete = (): void => play('timerComplete')
