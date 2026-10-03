/**
 * Batalla en curso. La posición dentro del circuito sale de `me.progress` del servidor y el
 * descanso de `resting_until` (#402): nada de contadores locales que el servidor rechazaría
 * por no ser monótonos. Lo único local es haber saltado el descanso.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'

import { battleElapsedMs } from '@calistenia/core/hooks/useBattle'
import { useCountdown } from '@calistenia/core/hooks/useCountdown'
import { battleExerciseLabel } from '@calistenia/core/data/battle-presets'
import { formatBattleElapsed } from '@calistenia/core/lib/battle'
import { serverNow } from '@calistenia/core/lib/serverClock'
import { restCues } from '../../lib/training-cues'
import { Button } from '../ui/button'
import { Kicker } from '../ui/kicker'
import { useBattleContext } from './BattleContext'
import BattleStandingsList from './BattleStandingsList'
import BattleFinishedWaiting from './BattleFinishedWaiting'
import BattleExerciseEntry from './BattleExerciseEntry'

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export default function BattleLive() {
  const { t, i18n } = useTranslation()
  const { snapshot, standings, busy, error, can, actions } = useBattleContext()

  const me = snapshot?.me ?? null
  const config = snapshot?.battle.config
  const progress = me?.progress
  const position = progress?.current_exercise_position ?? 0
  const exercise = config?.exercises.find(ex => ex.position === position) ?? config?.exercises[0]

  const [elapsed, setElapsed] = useState(0)
  const startsAt = snapshot?.battle.starts_at ?? null
  useEffect(() => {
    const tick = () => setElapsed(battleElapsedMs(startsAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startsAt])

  // El progreso sin conexión no es verificable: se bloquea la entrada en vez de guardarlo.
  const online = useOnline()
  const offline = !online || (!!error && error.status === 0)
  const locked = offline || busy || !can.progress

  // Dependencias primitivas: la fila propia del marcador es un objeto nuevo en cada snapshot.
  const meUserId = me?.user ?? null
  const restingUntilIso = useMemo(
    () => standings.find(entry => entry.user === meUserId)?.resting_until ?? null,
    [standings, meUserId],
  )
  const serverRestEndsAt = restingUntilIso ? Date.parse(restingUntilIso) : null
  const [skippedRestAt, setSkippedRestAt] = useState<number | null>(null)
  const restEndsAt = serverRestEndsAt !== null && serverRestEndsAt !== skippedRestAt ? serverRestEndsAt : null

  // El descanso es el del ejercicio que se acaba de cerrar, como lo calcula el servidor.
  const restTotalSeconds = useMemo(() => {
    if (!config?.exercises.length) return 0
    const count = config.exercises.length
    return config.exercises[(position - 1 + count) % count]?.rest_seconds ?? 0
  }, [config, position])

  const rest = useCountdown({ endAt: restEndsAt, totalSeconds: restTotalSeconds, now: serverNow, onCue: restCues })
  const skipRest = useCallback(() => setSkippedRestAt(serverRestEndsAt), [serverRestEndsAt])

  const isLastExercise = !!config && position >= config.exercises.length - 1
  const willFinish = !!progress && !!config && isLastExercise && progress.completed_rounds + 1 >= config.rounds

  const submitProgress = useCallback(async (value: number) => {
    if (!config || !progress || !exercise) return
    const isReps = exercise.target.kind === 'reps'
    const next = {
      completed_rounds: isLastExercise ? progress.completed_rounds + 1 : progress.completed_rounds,
      completed_reps: progress.completed_reps + (isReps ? value : 0),
      completed_time_seconds: progress.completed_time_seconds + (isReps ? 0 : value),
      current_exercise_position: isLastExercise ? 0 : position + 1,
    }
    try {
      if (willFinish) await actions.finish(next)
      else await actions.reportProgress(next)
      setSkippedRestAt(null)
    } catch { /* el contexto expone el error */ }
  }, [actions, config, exercise, isLastExercise, position, progress, willFinish])

  if (!snapshot || !config || !me || !exercise || !progress) return null

  // Tu circuito ha terminado pero la batalla sigue (#404).
  if (me.status === 'finished' || me.status === 'left') return <BattleFinishedWaiting />

  const resting = restEndsAt !== null && restEndsAt > serverNow()
  const exerciseName = battleExerciseLabel(config, exercise.exercise_id, i18n.language)
  const roundLabel = `${Math.min(progress.completed_rounds + 1, config.rounds)} / ${config.rounds}`

  return (
    <div className="flex flex-col">
      {offline && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5">
          <WifiOff className="size-3.5 text-amber-400" aria-hidden />
          <span className="flex-1 font-mono text-[10px] uppercase tracking-[1px] text-amber-400">{t('battle.offlineBlocked')}</span>
        </div>
      )}

      <div className="flex items-end justify-between border-b border-border pb-3">
        <div>
          <Kicker size="xs">{t('battle.round')}</Kicker>
          <div className="font-bebas text-4xl leading-none mt-1">{roundLabel}</div>
        </div>
        <div className="text-right">
          <Kicker size="xs">{t('battle.elapsed')}</Kicker>
          <div className="font-mono text-2xl text-lime mt-1 tabular-nums">{formatBattleElapsed(elapsed)}</div>
        </div>
      </div>

      {resting ? (
        <div className="flex flex-col items-center gap-3 py-10" role="timer">
          <Kicker>{t('battle.rest')}</Kicker>
          <div className="font-bebas text-8xl leading-none tabular-nums">{rest.secondsLeft}</div>
          <p className="font-mono text-xs text-muted-foreground">{t('battle.nextUp')} {exerciseName}</p>
          <Button variant="outline" className="h-11" onClick={skipRest}>{t('battle.skipRest')}</Button>
        </div>
      ) : (
        <BattleExerciseEntry
          key={`${exercise.exercise_id}-${position}-${progress.completed_rounds}`}
          name={exerciseName}
          targetKind={exercise.target.kind}
          targetValue={exercise.target.value}
          locked={locked}
          confirmLabel={willFinish ? t('battle.finish') : t('battle.nextExercise')}
          onConfirm={value => { void submitProgress(value) }}
        />
      )}

      <Kicker className="mt-8 mb-2">{t('battle.liveStandings')}</Kicker>
      <BattleStandingsList standings={standings} config={config} meUserId={me.user} />
    </div>
  )
}
