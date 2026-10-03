/** Balance + filas del historial de batallas (#398). Sin cabecera propia: la pone quien lo monta. */
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Swords } from 'lucide-react'

import { useBattleHistory, type BattleHistoryEntry } from '@calistenia/core/hooks/useBattleHistory'
import { relativeDate, utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { battleWorkColumns, type BattleOutcome } from '@calistenia/core/lib/battle'
import { battleTitle } from '@calistenia/core/data/battle-presets'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Kicker } from '../ui/kicker'
import BattleScoreCell from './BattleScoreCell'

const OUTCOME_KEY: Record<BattleOutcome, string> = {
  won: 'battle.outcomeWon',
  lost: 'battle.outcomeLost',
  left: 'battle.outcomeLeft',
  unknown: 'battle.outcomeUnknown',
}

function HistoryRow({ entry, meId }: { entry: BattleHistoryEntry; meId: string | null }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const { battle, outcome, rank, standings } = entry
  // Una batalla cancelada o caducada no tiene `finished_at`.
  const when = battle.finished_at || battle.last_activity_at || battle.created
  const columns = battleWorkColumns(battle.config)
  const title = battleTitle(battle.config, i18n.language)

  return (
    <li className="border-b border-border">
      <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} className="flex min-h-14 w-full items-center gap-3 py-3 text-left hover:bg-muted/30 transition-colors">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {title ? `${title} · ` : ''}{battle.config.rounds} {t('battle.rounds')} · {battle.config.exercises.length} {t('battle.exercises')}
          </div>
          <Kicker size="xs" className="mt-1">
            {relativeDate(utcToLocalDateStr(when))}
            {rank !== null && standings.length > 0 ? `  ·  ${t('battle.rankOf', { rank, total: standings.length })}` : ''}
          </Kicker>
        </div>
        <span className={cn('font-mono text-[10px] uppercase tracking-[2px]', outcome === 'won' ? 'text-lime' : 'text-muted-foreground')}>
          {t(OUTCOME_KEY[outcome])}
        </span>
      </button>

      {open && (
        <div className="border-t border-border pb-2 pt-2">
          {standings.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">{t('battle.noStoredResult')}</p>
          ) : standings.map(s => (
            <div key={s.participant_id} className={cn('flex items-center gap-3 py-1.5', s.user === meId && 'bg-lime/5')}>
              <span className={cn('w-5 font-bebas text-base', s.display_rank === 1 ? 'text-lime' : 'text-muted-foreground')}>{s.display_rank}</span>
              <span className="flex-1 min-w-0 truncate text-sm">
                {s.display_name || t('battle.someone')}{s.status === 'left' ? `  ${t('battle.leftTag')}` : ''}
              </span>
              <BattleScoreCell size="sm" rounds={s.score.completed_rounds} reps={s.score.completed_reps} seconds={s.score.completed_time_seconds} showReps={columns.reps} showSeconds={columns.seconds} />
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

export default function BattleHistoryList({ userId, header }: { userId: string | null; header?: ReactNode }) {
  const { t } = useTranslation()
  const { entries, record } = useBattleHistory(userId)

  return (
    <div className="flex flex-col gap-4">
      {header}

      <div className="grid grid-cols-3 gap-2">
        {([
          [t('battle.recordFought'), record.fought],
          [t('battle.recordWon'), record.won],
          [t('battle.recordStreak'), record.streak],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border px-3 py-3">
            <Kicker size="xs">{label}</Kicker>
            <div className="mt-1 font-bebas text-3xl leading-none tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      {entries.length > 0 ? (
        <section>
          <Kicker className="mb-1">{t('battle.compare')}</Kicker>
          <ul className="border-t border-border">
            {entries.map(entry => <HistoryRow key={entry.battle.id} entry={entry} meId={userId} />)}
          </ul>
        </section>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Swords className="size-7 text-muted-foreground" aria-hidden />
          <h2 className="font-bebas text-2xl">{t('battle.historyEmpty')}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{t('battle.historyEmptyDesc')}</p>
          <Button asChild className="h-11"><Link to="/battle-create">{t('battle.newBattle')}</Link></Button>
        </div>
      )}
    </div>
  )
}
