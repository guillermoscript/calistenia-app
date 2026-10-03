/** Marcador en vivo de una batalla (#397, #426, #453). */
import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { battleExerciseLabel } from '@calistenia/core/data/battle-presets'
import {
  battleDisplayRanks, battleParticipantActivity, battleRestSecondsLeft, battleWorkColumns,
} from '@calistenia/core/lib/battle'
import { serverNow } from '@calistenia/core/lib/serverClock'
import type { BattleConfiguration, BattleStanding } from '@calistenia/core/types/battle'
import { cn } from '../../lib/utils'
import { Kicker } from '../ui/kicker'
import BattleScoreCell from './BattleScoreCell'

/** Con alguien descansando hay que ir al segundo; si no, basta con vigilar el «inactivo». */
const TICK_RESTING_MS = 1000
const TICK_IDLE_MS = 15_000

/** Dónde está cada rival ahora mismo (#397). */
function activityLine(
  entry: BattleStanding, config: BattleConfiguration, now: number, language: string, t: (key: string) => string,
): string | null {
  const activity = battleParticipantActivity(entry, now)
  if (activity === 'finished' || activity === 'left') return null
  if (activity === 'resting') return `${t('battle.stateResting')} ${battleRestSecondsLeft(entry.resting_until, now)}s`
  if (activity === 'idle') return t('battle.stateIdle')

  const position = entry.current_exercise_position
  if (position === null) return t('battle.stateStarting')
  const exercise = config.exercises.find(ex => ex.position === position)
  if (!exercise) return t('battle.stateStarting')
  return `${t('battle.roundsShort')}${entry.score.completed_rounds + 1} · ${battleExerciseLabel(config, exercise.exercise_id, language)}`
}

interface RowProps {
  rank: number
  displayName: string
  activity: string | null
  isMe: boolean
  hasLeft: boolean
  hasFinished: boolean
  rounds: number
  reps: number
  seconds: number
  showReps: boolean
  showSeconds: boolean
  leftTag: string
}

const Row = memo(function Row(p: RowProps) {
  return (
    <li className={cn('flex items-center gap-3 border-b border-border py-2.5', p.isMe && 'bg-lime/5')}>
      <span className="w-6 font-bebas text-lg text-muted-foreground">{p.rank}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {p.displayName}{p.hasLeft ? `  ${p.leftTag}` : ''}{p.hasFinished ? '  ✓' : ''}
        </div>
        {p.activity ? <Kicker size="xs" className="truncate mt-0.5">{p.activity}</Kicker> : null}
      </div>
      <BattleScoreCell rounds={p.rounds} reps={p.reps} seconds={p.seconds} showReps={p.showReps} showSeconds={p.showSeconds} />
    </li>
  )
})

export default function BattleStandingsList({ standings, config, meUserId }: {
  standings: BattleStanding[]
  config: BattleConfiguration
  meUserId: string | null
}) {
  const { t, i18n } = useTranslation()
  // `resting_until` es hora del servidor: se compara contra el reloj corregido (#397).
  const [now, setNow] = useState(() => serverNow())
  const someoneResting = standings.some(entry => entry.resting_until !== null)
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), someoneResting ? TICK_RESTING_MS : TICK_IDLE_MS)
    return () => clearInterval(id)
  }, [someoneResting])

  const columns = useMemo(() => battleWorkColumns(config), [config])
  const displayRanks = useMemo(() => battleDisplayRanks(standings), [standings])
  const leftTag = t('battle.leftTag')

  return (
    <ul>
      {standings.map(entry => {
        const isMe = entry.user === meUserId
        return (
          <Row
            key={entry.participant_id}
            rank={displayRanks.get(entry.participant_id) ?? entry.rank}
            displayName={entry.display_name || (isMe ? t('battle.youName') : t('battle.someone'))}
            activity={activityLine(entry, config, now, i18n.language, t)}
            isMe={isMe}
            hasLeft={entry.status === 'left'}
            hasFinished={entry.status === 'finished'}
            rounds={entry.score.completed_rounds}
            reps={entry.score.completed_reps}
            seconds={entry.score.completed_time_seconds}
            showReps={columns.reps}
            showSeconds={columns.seconds}
            leftTag={leftTag}
          />
        )
      })}
    </ul>
  )
}
