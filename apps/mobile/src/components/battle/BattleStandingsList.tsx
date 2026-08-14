/**
 * Marcador en vivo de una batalla.
 *
 * Vive aparte porque lo comparten la vista de entreno y la de espera (#404): quien ha
 * terminado sigue queriendo ver si le alcanzan, y sin extraerlo no había forma barata de
 * enseñar "todo menos la entrada de ejercicio".
 *
 * La fila es un componente memoizado que recibe su línea de actividad **ya calculada**
 * (#402). Antes el tic de un segundo re-renderizaba las ocho filas aunque solo cambiara
 * la de quien está descansando; ahora el tic recalcula ocho cadenas —barato— y React
 * solo vuelve a pintar aquellas cuya cadena cambió.
 */
import { memo, useEffect, useMemo, useState } from 'react'
import { View, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import BattleScoreCell from '@/components/battle/BattleScoreCell'
import { battleExerciseName } from '@calistenia/core/data/battle-presets'
import {
  battleParticipantActivity,
  battleRestSecondsLeft,
  battleWorkColumns,
} from '@calistenia/core/lib/battle'
import { serverNow } from '@calistenia/core/lib/serverClock'
import type { BattleConfiguration, BattleStanding } from '@calistenia/core/types/battle'

/** Con alguien descansando hay que ir al segundo; si no, basta con vigilar el "inactivo". */
const TICK_RESTING_MS = 1000
const TICK_IDLE_MS = 15_000

/**
 * Dónde está cada rival ahora mismo (#397).
 *
 * Sin esto el marcador solo dice cuánto lleva cada uno, y un contador parado se lee
 * igual tanto si está descansando como si se ha ido: justo la diferencia que importa
 * cuando quieres saber quién está a punto de terminar.
 */
function activityLine(
  entry: BattleStanding,
  config: BattleConfiguration,
  now: number,
  language: string,
  t: (key: string) => string,
): string | null {
  const activity = battleParticipantActivity(entry, now)
  if (activity === 'finished' || activity === 'left') return null
  if (activity === 'resting') {
    const left = battleRestSecondsLeft(entry.resting_until, now)
    return `${t('battle.stateResting')} ${left}s`
  }
  if (activity === 'idle') return t('battle.stateIdle')

  const position = entry.current_exercise_position
  if (position === null) return t('battle.stateStarting')
  const exercise = config.exercises.find((ex) => ex.position === position)
  if (!exercise) return t('battle.stateStarting')

  // La ronda es la que está en curso, no la que ya cerró.
  const round = entry.score.completed_rounds + 1
  return `${t('battle.roundsShort')}${round} · `
    + battleExerciseName(config.workout_template_id, exercise.exercise_id, language)
}

interface BattleStandingsRowProps {
  rank: number
  displayName: string
  /** Ya calculada por el padre para que la memoización funcione con primitivas. */
  activity: string | null
  isMe: boolean
  hasLeft: boolean
  hasFinished: boolean
  completedRounds: number
  completedReps: number
  completedTimeSeconds: number
  /** Del circuito, no de la fila: todas las filas enseñan las mismas columnas (#426). */
  showReps: boolean
  showSeconds: boolean
  leftTag: string
}

function BattleStandingsRowComponent({
  rank,
  displayName,
  activity,
  isMe,
  hasLeft,
  hasFinished,
  completedRounds,
  completedReps,
  completedTimeSeconds,
  showReps,
  showSeconds,
  leftTag,
}: BattleStandingsRowProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-3 border-b border-border py-2.5',
        isMe && 'bg-lime/5',
      )}
    >
      <Text className="w-6 font-bebas text-lg text-muted-foreground">{rank}</Text>
      <View className="flex-1">
        <Text className="font-sans-medium text-foreground" numberOfLines={1}>
          {displayName}
          {hasLeft ? `  ${leftTag}` : ''}
          {hasFinished ? '  ✓' : ''}
        </Text>
        {activity ? (
          <Text
            className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground"
            numberOfLines={1}
          >
            {activity}
          </Text>
        ) : null}
      </View>
      <BattleScoreCell
        rounds={completedRounds}
        reps={completedReps}
        seconds={completedTimeSeconds}
        showReps={showReps}
        showSeconds={showSeconds}
      />
    </View>
  )
}

const BattleStandingsRow = memo(BattleStandingsRowComponent)

interface BattleStandingsListProps {
  standings: BattleStanding[]
  config: BattleConfiguration
  meUserId: string | null
  /**
   * Quién se queda el scroll. En la vista de entreno lo tiene la lista, que es lo único
   * que crece; en la de espera lo tiene la pantalla entera (#432), porque una lista
   * estirada a `flex-1` con dos participantes dejaba un vacío enorme bajo la última fila.
   */
  scroll?: boolean
}

export default function BattleStandingsList({
  standings,
  config,
  meUserId,
  scroll = true,
}: BattleStandingsListProps) {
  const { t, i18n } = useTranslation()

  // `resting_until` es hora del servidor, así que la cuenta atrás se compara contra el
  // reloj corregido y no contra el del dispositivo (#397).
  const [now, setNow] = useState(() => serverNow())
  const someoneResting = standings.some((entry) => entry.resting_until !== null)
  useEffect(() => {
    const id = setInterval(
      () => setNow(serverNow()),
      someoneResting ? TICK_RESTING_MS : TICK_IDLE_MS,
    )
    return () => clearInterval(id)
  }, [someoneResting])

  const rows = useMemo(
    () => standings.map((entry) => ({
      entry,
      activity: activityLine(entry, config, now, i18n.language, t),
    })),
    [standings, config, now, i18n.language, t],
  )

  // Un circuito con plancha enseña los segundos desde el minuto cero; uno todo-reps sigue
  // con sus dos columnas de siempre (#426).
  const columns = useMemo(() => battleWorkColumns(config), [config])

  const leftTag = t('battle.leftTag')
  const someone = t('battle.someone')
  // El servidor manda cadena vacía cuando la cuenta no tiene `display_name`, así que el
  // relleno es cosa del cliente. Caer en el mismo "Alguien" que el rival dejaba una
  // pantalla cara a cara donde solo te distinguía un fondo lime al 5 % (#432).
  const youName = t('battle.youName')

  const rowNodes = rows.map(({ entry, activity }) => {
    const isMe = entry.user === meUserId
    return (
      <BattleStandingsRow
        key={entry.participant_id}
        rank={entry.rank}
        displayName={entry.display_name || (isMe ? youName : someone)}
        activity={activity}
        isMe={isMe}
        hasLeft={entry.status === 'left'}
        hasFinished={entry.status === 'finished'}
        completedRounds={entry.score.completed_rounds}
        completedReps={entry.score.completed_reps}
        completedTimeSeconds={entry.score.completed_time_seconds}
        showReps={columns.reps}
        showSeconds={columns.seconds}
        leftTag={leftTag}
      />
    )
  })

  if (!scroll) return <View>{rowNodes}</View>
  return <ScrollView className="flex-1">{rowNodes}</ScrollView>
}
