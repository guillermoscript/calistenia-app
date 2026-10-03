/**
 * Resultado de la batalla (#357). Se lee de `final_standings` (congelado al cerrar), los
 * empates comparten puesto y no se avergüenza a nadie: terminar es el logro, ganar un extra.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'

import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { battleResultView, battleWorkColumns, type BattleResultRow } from '@calistenia/core/lib/battle'
import { battleTitle } from '@calistenia/core/data/battle-presets'
import { cn } from '../../lib/utils'
import { resultHeadlineKey } from '../../lib/battle-result'
import { Button } from '../ui/button'
import { Kicker } from '../ui/kicker'
import { useBattleContext } from './BattleContext'
import BattleScoreCell from './BattleScoreCell'

const ResultRow = memo(function ResultRow({ row, mine, showReps, showSeconds }: {
  row: BattleResultRow; mine: boolean; showReps: boolean; showSeconds: boolean
}) {
  const { t } = useTranslation()
  const left = row.status === 'left'
  return (
    <li className={cn('flex items-center gap-3 border-b border-border py-3', mine && 'bg-lime/5')}>
      <span className="flex w-9 items-baseline">
        <span className={cn('font-bebas text-2xl', row.display_rank === 1 && !left ? 'text-lime' : 'text-muted-foreground')}>{row.display_rank}</span>
        {row.tied ? <span className="ml-0.5 font-mono text-[10px] text-muted-foreground">=</span> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-sm font-medium', row.deleted_user && 'italic text-muted-foreground', left && 'text-muted-foreground')}>
          {row.deleted_user ? t('battle.deletedUser') : (row.display_name || t('battle.someone'))}
        </div>
        {left ? <Kicker size="xs" className="mt-0.5">{t('battle.leftTag')}</Kicker> : null}
      </div>
      <BattleScoreCell rounds={row.score.completed_rounds} reps={row.score.completed_reps} seconds={row.score.completed_time_seconds} showReps={showReps} showSeconds={showSeconds} />
    </li>
  )
})

export default function BattleResults({ userId }: { userId: string | null }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { snapshot, standings, phase, isCreator, busy, actions } = useBattleContext()
  const [rematching, setRematching] = useState(false)
  const [rematchError, setRematchError] = useState(false)

  const result = useMemo(() => battleResultView(snapshot?.battle ?? null, standings, userId), [snapshot?.battle, standings, userId])

  // Un solo `battle_completed` por batalla: lo emite el creador al ver el estado terminal.
  const completedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'finished' || !isCreator || completedRef.current || !snapshot) return
    completedRef.current = true
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleCompleted, {
      surface: 'battle', source: 'battle_results', battle_id: snapshot.battle.id,
      participant_count: snapshot.participants.length, result: 'completed',
    })
  }, [phase, isCreator, snapshot])

  // `battle_results_viewed`: uno por espectador y batalla.
  const viewedRef = useRef<string | null>(null)
  const battleId = snapshot?.battle.id ?? null
  useEffect(() => {
    if (!battleId || result.state === 'open' || viewedRef.current === battleId) return
    viewedRef.current = battleId
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleResultsViewed, {
      surface: 'battle', source: 'battle_results', battle_id: battleId,
      participant_count: result.rows.length, result: result.outcome,
    })
  }, [battleId, result.state, result.outcome, result.rows.length])

  const columns = battleWorkColumns(snapshot?.battle.config)
  const circuitName = battleTitle(snapshot?.battle.config, i18n.language) || t('battle.title')
  const headline = t(resultHeadlineKey(result.state, result.outcome))

  const handleRematch = () => {
    if (rematching) return
    setRematching(true)
    setRematchError(false)
    actions.rematch()
      .then(next => {
        // El servidor emite un token nominal por cabeza y lo manda por push.
        const invited = Math.max(0, result.rows.length - 1)
        if (invited > 0) {
          trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.inviteSent, {
            surface: 'battle', source: 'battle_results', battle_id: next.battle.id,
            share_type: 'rematch_invite', participant_count: invited, result: 'sent', share_confirmed: false,
          })
        }
        trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleRematchCreated, {
          surface: 'battle', source: 'battle_results', battle_id: next.battle.id,
          participant_count: result.rows.length, result: 'created',
        })
        navigate(`/battle/${next.battle.id}`, { replace: true })
      })
      .catch(() => setRematchError(true))
      .finally(() => setRematching(false))
  }

  return (
    <div className="flex flex-col gap-5 pt-2">
      <header className="flex flex-col items-center text-center">
        <Kicker>{t('battle.kicker')}</Kicker>
        <h1 className="mt-2 font-bebas text-4xl md:text-5xl leading-none">{headline}</h1>
        <p className="mt-1 truncate text-sm text-muted-foreground">{circuitName}</p>
        {result.state === 'expired' && <p className="mt-2 text-sm text-muted-foreground">{t('battle.expiredHint')}</p>}
        {result.outcome === 'solo' && <p className="mt-2 text-sm text-muted-foreground">{t('battle.soloHint')}</p>}
      </header>

      {result.state === 'no_result' ? (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">{t('battle.noStoredResult')}</p>
      ) : (
        <section>
          <Kicker className="mb-2">{t('battle.finalStandings')}</Kicker>
          <ul>
            {result.rows.map(row => (
              <ResultRow key={row.participant_id} row={row} mine={row.participant_id === result.me?.participant_id} showReps={columns.reps} showSeconds={columns.seconds} />
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2.5">
        {rematchError && <p role="alert" className="text-center text-xs text-red-400">{t('battle.rematchError')}</p>}
        <Button className="h-12 gap-2 font-bebas text-lg tracking-widest uppercase" disabled={rematching || busy} onClick={handleRematch}>
          <RotateCcw className="size-4" aria-hidden />
          {rematching ? t('battle.rematchCreating') : t('battle.rematch')}
        </Button>
        <Button variant="ghost" className="h-11 font-bebas text-lg tracking-widest uppercase text-muted-foreground" onClick={() => navigate('/community?tab=battles')}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  )
}
