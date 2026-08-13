/**
 * Batalla en curso: el circuito propio a la izquierda del pulgar y el marcador en vivo.
 *
 * La posición dentro del circuito NO se guarda en local: sale de `me.progress` del
 * servidor. Así, si la app muere a mitad de la ronda 3, al volver se retoma en la
 * ronda 3 sin inventarse nada y sin arriesgar un contador local que el servidor
 * rechazaría por no ser monótono.
 */
import { useEffect, useMemo, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, WifiOff } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useBattleContext } from '@/contexts/BattleContext'
import { isOnline, onConnectivityChange } from '@/lib/connectivity'
import BattleStandingsList from '@/components/battle/BattleStandingsList'
import BattleFinishedWaiting from '@/components/battle/BattleFinishedWaiting'
import { battleElapsedMs } from '@calistenia/core/hooks/useBattle'
import { battleExerciseName } from '@calistenia/core/data/battle-presets'
import { formatBattleElapsed } from '@calistenia/core/lib/battle'

export default function BattleLive() {
  const { t, i18n } = useTranslation()
  const { snapshot, standings, busy, error, can, actions } = useBattleContext()

  const me = snapshot?.me ?? null
  const config = snapshot?.battle.config
  const progress = me?.progress

  const position = progress?.current_exercise_position ?? 0
  const exercise = config?.exercises.find((ex) => ex.position === position) ?? config?.exercises[0]

  // El contador arranca en el objetivo: lo normal es completarlo, y ajustar a la baja
  // es un caso menos frecuente que confirmar.
  const [count, setCount] = useState(exercise?.target.value ?? 0)
  useEffect(() => { setCount(exercise?.target.value ?? 0) }, [exercise?.exercise_id, exercise?.target.value])

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

  // El descanso es puramente local: el progreso ya se reportó al confirmar el ejercicio,
  // así que esto no toca el contrato con el servidor. Se puede saltar — el servidor no
  // vigila el ritmo, y un temporizador obligatorio dejaría tirado a quien tenga la app
  // en segundo plano cuando termine.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [restLeft, setRestLeft] = useState(0)
  useEffect(() => {
    if (restEndsAt === null) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000))
      setRestLeft(left)
      if (left <= 0) {
        setRestEndsAt(null)
        void haptics.medium()
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [restEndsAt])

  const roundLabel = useMemo(() => {
    if (!config || !progress) return ''
    return `${Math.min(progress.completed_rounds + 1, config.rounds)} / ${config.rounds}`
  }, [config, progress])

  if (!snapshot || !config || !me || !exercise || !progress) return null

  // Tu circuito ha terminado pero la batalla sigue: dejar la UI de entreno con los
  // controles apagados decía que seguías entrenando, y no había salida (#404).
  if (me.status === 'finished' || me.status === 'left') return <BattleFinishedWaiting />

  const isLastExercise = position >= config.exercises.length - 1
  const willFinish = isLastExercise && progress.completed_rounds + 1 >= config.rounds

  const commit = async () => {
    const isReps = exercise.target.kind === 'reps'
    // El descanso es el del ejercicio que se acaba de cerrar, no el del siguiente, y hay
    // que leerlo antes de await: al volver, `exercise` ya es el siguiente del circuito.
    const restSeconds = exercise.rest_seconds
    const next = {
      completed_rounds: isLastExercise ? progress.completed_rounds + 1 : progress.completed_rounds,
      completed_reps: progress.completed_reps + (isReps ? count : 0),
      completed_time_seconds: progress.completed_time_seconds + (isReps ? 0 : count),
      current_exercise_position: isLastExercise ? 0 : position + 1,
    }
    try {
      if (willFinish) {
        await actions.finish(next)
      } else {
        await actions.reportProgress(next)
        // Un 0 es una decisión del formato, no un hueco: encadena sin pausa.
        if (restSeconds > 0) setRestEndsAt(Date.now() + restSeconds * 1000)
      }
      void haptics.medium()
    } catch { /* el contexto expone el error */ }
  }

  const resting = restEndsAt !== null

  return (
    <View className="flex-1">
      {offline && (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5">
          <WifiOff size={14} color="#fbbf24" />
          <Text className="flex-1 font-mono text-[10px] uppercase tracking-[1px] text-amber-400">
            {t('battle.offlineBlocked')}
          </Text>
        </View>
      )}

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
        <View className="items-center gap-4 py-6">
          <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('battle.rest')}
          </Text>
          <Text className="font-bebas text-[96px] leading-none text-lime">{restLeft}</Text>
          <Text className="font-mono text-xs text-muted-foreground">
            {t('battle.nextUp')}{' '}
            {battleExerciseName(config.workout_template_id, exercise.exercise_id, i18n.language)}
          </Text>
          <Pressable
            onPress={() => {
              setRestEndsAt(null)
              void haptics.light()
            }}
            className="mt-2 h-12 items-center justify-center rounded-xl border border-border px-6 active:bg-muted/40"
          >
            <Text className="font-mono text-[11px] uppercase tracking-[2px] text-muted-foreground">
              {t('battle.skipRest')}
            </Text>
          </Pressable>
        </View>
      ) : (
      /* Ejercicio actual + entrada */
      <View className="items-center gap-4 py-6">
        <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('battle.currentExercise')}
        </Text>
        <Text className="text-center font-bebas text-5xl leading-none text-foreground">
          {battleExerciseName(config.workout_template_id, exercise.exercise_id, i18n.language)}
        </Text>
        <Text className="font-mono text-xs text-muted-foreground">
          {t('battle.target')} {exercise.target.value}
          {exercise.target.kind === 'seconds' ? 's' : ` ${t('battle.reps')}`}
        </Text>

        <View className="mt-2 flex-row items-center gap-6">
          <Pressable
            onPress={() => setCount((c) => Math.max(0, c - 1))}
            disabled={locked}
            className={cn(
              'size-14 items-center justify-center rounded-full border border-border active:bg-muted/50',
              locked && 'opacity-40',
            )}
          >
            <Minus size={20} color="#888899" />
          </Pressable>
          <Text className="min-w-24 text-center font-bebas text-6xl leading-none text-lime">{count}</Text>
          <Pressable
            onPress={() => setCount((c) => c + 1)}
            disabled={locked}
            className={cn(
              'size-14 items-center justify-center rounded-full border border-border active:bg-muted/50',
              locked && 'opacity-40',
            )}
          >
            <Plus size={20} color="#888899" />
          </Pressable>
        </View>
      </View>
      )}

      {!resting && (
        <Pressable
          onPress={() => void commit()}
          disabled={locked}
          className={cn(
            'h-16 items-center justify-center rounded-xl bg-lime active:bg-lime/90',
            locked && 'opacity-40',
          )}
        >
          <Text className="font-bebas text-2xl uppercase tracking-widest text-zinc-900">
            {willFinish ? t('battle.finish') : t('battle.nextExercise')}
          </Text>
        </Pressable>
      )}

      {/* Marcador en vivo */}
      <Text className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
        {t('battle.liveStandings')}
      </Text>
      <BattleStandingsList standings={standings} config={config} meUserId={me.user} />
    </View>
  )
}
