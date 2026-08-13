/**
 * Historial de batallas en Progreso (#398).
 *
 * Las batallas se juegan en la app nativa, pero el resultado es progreso como cualquier
 * otro y esta es la página donde se mira. La clasificación viene congelada en la propia
 * batalla, así que abrir la comparativa no cuesta una petición.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { useBattleHistory, type BattleHistoryEntry } from '@calistenia/core/hooks/useBattleHistory'
import { relativeDate } from '@calistenia/core/lib/dateUtils'
import type { BattleOutcome } from '@calistenia/core/lib/battle'

const OUTCOME_KEY: Record<BattleOutcome, string> = {
  won: 'battle.outcomeWon',
  lost: 'battle.outcomeLost',
  left: 'battle.outcomeLeft',
  unknown: 'battle.outcomeUnknown',
}

function BattleRow({ entry, meId }: { entry: BattleHistoryEntry; meId: string | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { battle, outcome, rank, standings } = entry
  // Una batalla cancelada o caducada no tiene `finished_at`.
  const when = battle.finished_at || battle.last_activity_at || battle.created

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left px-4 py-3 hover:border-lime/30 transition-colors flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-xs text-muted-foreground w-16 shrink-0">{relativeDate(when.slice(0, 10))}</div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {battle.config.rounds} {t('battle.rounds')} · {battle.config.exercises.length} {t('battle.exercises')}
            </div>
            {rank !== null && standings.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                {t('battle.rankOf', { rank, total: standings.length })}
              </div>
            )}
          </div>
        </div>
        <span
          className={cn(
            'text-[10px] uppercase tracking-[2px] shrink-0',
            outcome === 'won' ? 'text-lime' : 'text-muted-foreground',
          )}
        >
          {t(OUTCOME_KEY[outcome])}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-2">
          {standings.length === 0 ? (
            <div className="py-2 text-xs text-muted-foreground">{t('battle.noStoredResult')}</div>
          ) : (
            standings.map(standing => (
              <div
                key={standing.participant_id}
                className={cn(
                  'flex items-center gap-3 py-1.5',
                  standing.user === meId && 'bg-lime/5',
                )}
              >
                <span className={cn('w-5 text-sm', standing.rank === 1 ? 'text-lime' : 'text-muted-foreground')}>
                  {standing.rank}
                </span>
                <span className="flex-1 text-sm truncate">
                  {standing.display_name || t('battle.someone')}
                  {standing.status === 'left' ? `  ${t('battle.leftTag')}` : ''}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {standing.score.completed_rounds}{t('battle.roundsShort')}{'  '}
                  {standing.score.completed_reps} {t('battle.repsShort')}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function BattleHistory({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const { entries, record } = useBattleHistory(userId)

  // Sin batallas no hay nada que contar, y un bloque vacío en Progreso solo estorba:
  // las batallas se crean en la app nativa, no aquí.
  if (entries.length === 0) return null

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-3 uppercase">
        {t('battle.historyTitle')}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          [t('battle.recordFought'), record.fought],
          [t('battle.recordWon'), record.won],
          [t('battle.recordStreak'), record.streak],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-card border border-border rounded-lg px-3 py-3">
            <div className="text-[9px] text-muted-foreground tracking-[2px] uppercase">{label}</div>
            <div className="text-2xl mt-1 tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {entries.slice(0, 10).map(entry => (
          <BattleRow key={entry.battle.id} entry={entry} meId={userId} />
        ))}
      </div>
    </div>
  )
}
