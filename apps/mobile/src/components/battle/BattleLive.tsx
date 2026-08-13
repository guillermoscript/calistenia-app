/**
 * Batalla en curso: el circuito propio a la izquierda del pulgar y el marcador en vivo.
 *
 * La posición dentro del circuito NO se guarda en local: sale de `me.progress` del
 * servidor. Así, si la app muere a mitad de la ronda 3, al volver se retoma en la
 * ronda 3 sin inventarse nada y sin arriesgar un contador local que el servidor
 * rechazaría por no ser monótono.
 *
 * El descanso sigue la misma regla desde el #402: quien decide que estás descansando es
 * el `resting_until` que deriva el servidor (`pb_hooks/utils/battles.js`), no un
 * temporizador local que sobreviviría a un cierre de la app y contaría de más. Lo único
 * local es haberlo saltado, que no cambia nada del contrato.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { useBattleContext } from '@/contexts/BattleContext'
import { haptics } from '@/lib/haptics'
import { isOnline, onConnectivityChange } from '@/lib/connectivity'
import { restCues } from '@/lib/training-cues'
import BattleStandingsList from '@/components/battle/BattleStandingsList'
import BattleFinishedWaiting from '@/components/battle/BattleFinishedWaiting'
import BattleExerciseEntry from '@/components/battle/BattleExerciseEntry'
import { RestPanel } from '@/components/training/RestPanel'
import { battleElapsedMs } from '@calistenia/core/hooks/useBattle'
import { useCountdown } from '@calistenia/core/hooks/useCountdown'
import { battleExerciseName } from '@calistenia/core/data/battle-presets'
import { formatBattleElapsed } from '@calistenia/core/lib/battle'
import { serverNow } from '@calistenia/core/lib/serverClock'

export default function BattleLive() {
  const { t, i18n } = useTranslation()
  const { snapshot, standings, busy, error, can, actions } = useBattleContext()

  const me = snapshot?.me ?? null
  const config = snapshot?.battle.config
  const progress = me?.progress

  const position = progress?.current_exercise_position ?? 0
  const exercise = config?.exercises.find((ex) => ex.position === position) ?? config?.exercises[0]

  const [elapsed, setElapsed] = useState(0)
  const startsAt = snapshot?.battle.starts_at ?? null
  useEffect(() => {
    const tick = () => setElapsed(battleElapsedMs(startsAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startsAt])

  // El progreso hecho sin conexión no es verificable, así que se bloquea la entrada en
  // vez de guardarlo en local y reproducirlo después (ver decisión en el spec v2).
  //
  // Se mira la conectividad directamente, no solo el error de la última petición: si
  // solo reaccionáramos al fallo, el botón seguiría vivo sin conexión y el usuario
  // tendría que tocarlo y ver reventar la petición para enterarse de que está bloqueado.
  const [online, setOnline] = useState(isOnline())
  useEffect(() => onConnectivityChange(setOnline), [])
  const offline = !online || (!!error && error.status === 0)
  const locked = offline || busy || !can.progress

  // El descanso, tal y como lo ve el servidor. Dependencias primitivas: la fila propia
  // del marcador es un objeto nuevo en cada snapshot, y con ella como dependencia el
  // descanso se rearmaría en cada latido (la clase de bug de 489780d).
  const meUserId = me?.user ?? null
  const restingUntilIso = useMemo(
    () => standings.find((entry) => entry.user === meUserId)?.resting_until ?? null,
    [standings, meUserId],
  )
  const serverRestEndsAt = restingUntilIso ? Date.parse(restingUntilIso) : null
  const [skippedRestAt, setSkippedRestAt] = useState<number | null>(null)
  const restEndsAt =
    serverRestEndsAt !== null && serverRestEndsAt !== skippedRestAt ? serverRestEndsAt : null

  // El descanso es el del ejercicio que se acaba de cerrar, igual que lo calcula el
  // servidor, para que el anillo se vacíe sobre el total correcto.
  const restTotalSeconds = useMemo(() => {
    if (!config?.exercises.length) return 0
    const count = config.exercises.length
    return config.exercises[(position - 1 + count) % count]?.rest_seconds ?? 0
  }, [config, position])

  const rest = useCountdown({
    endAt: restEndsAt,
    totalSeconds: restTotalSeconds,
    now: serverNow,
    onCue: restCues,
  })

  const skipRest = useCallback(() => { setSkippedRestAt(serverRestEndsAt) }, [serverRestEndsAt])

  const roundLabel = useMemo(() => {
    if (!config || !progress) return ''
    return `${Math.min(progress.completed_rounds + 1, config.rounds)} / ${config.rounds}`
  }, [config, progress])

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
      // El descanso llega derivado en el propio snapshot de la respuesta; aquí solo hay
      // que dejar de considerar saltado el anterior.
      setSkippedRestAt(null)
      void haptics.medium()
    } catch { /* el contexto expone el error */ }
  }, [actions, config, exercise, isLastExercise, position, progress, willFinish])

  const handleConfirm = useCallback((value: number) => { void submitProgress(value) }, [submitProgress])

  if (!snapshot || !config || !me || !exercise || !progress) return null

  // Tu circuito ha terminado pero la batalla sigue: dejar la UI de entreno con los
  // controles apagados decía que seguías entrenando, y no había salida (#404).
  if (me.status === 'finished' || me.status === 'left') return <BattleFinishedWaiting />

  // El descanso se cierra por reloj, no esperando a que el servidor deje de mandarlo:
  // `resting_until` sigue viajando en el snapshot que ya teníamos y, sin nuevos eventos
  // de realtime, quedarse mirando ese campo dejaría la pantalla de descanso clavada en
  // 0 s. El tic de `useCountdown` es lo que provoca el re-render en el que se apaga.
  const resting = restEndsAt !== null && restEndsAt > serverNow()
  const exerciseName = battleExerciseName(config.workout_template_id, exercise.exercise_id, i18n.language)

  return (
    <View className="flex-1">
      {offline ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5">
          <WifiOff size={14} color="#fbbf24" />
          <Text className="flex-1 font-mono text-[10px] uppercase tracking-[1px] text-amber-400">
            {t('battle.offlineBlocked')}
          </Text>
        </View>
      ) : null}

      {/* Estado propio */}
      <View className="flex-row items-end justify-between border-b border-border pb-3">
        <View>
          <Text className="font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
            {t('battle.round')}
          </Text>
          <Text className="font-bebas text-4xl leading-none text-foreground">{roundLabel}</Text>
        </View>
        <View className="items-end">
          <Text className="font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
            {t('battle.elapsed')}
          </Text>
          <Text className="font-mono text-2xl text-lime">{formatBattleElapsed(elapsed)}</Text>
        </View>
      </View>

      {/* Descanso: sustituye la entrada, pero deja a la vista cabecera y marcador */}
      {resting ? (
        <View className="py-6">
          <RestPanel
            secondsLeft={rest.secondsLeft}
            progress={rest.progress}
            endAt={restEndsAt}
            now={serverNow}
            label={t('battle.rest')}
            skipLabel={t('battle.skipRest')}
            onSkip={skipRest}
          >
            <Text className="font-mono text-xs text-muted-foreground">
              {t('battle.nextUp')} {exerciseName}
            </Text>
          </RestPanel>
        </View>
      ) : (
        <BattleExerciseEntry
          key={`${exercise.exercise_id}-${position}-${progress.completed_rounds}`}
          name={exerciseName}
          targetKind={exercise.target.kind}
          targetValue={exercise.target.value}
          locked={locked}
          confirmLabel={willFinish ? t('battle.finish') : t('battle.nextExercise')}
          onConfirm={handleConfirm}
        />
      )}

      {/* Marcador en vivo */}
      <Text className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
        {t('battle.liveStandings')}
      </Text>
      <BattleStandingsList standings={standings} config={config} meUserId={me.user} />
    </View>
  )
}
