/**
 * Pestaña Batallas de Comunidad: la batalla en curso, el acceso a crear una y el historial.
 * Equivalente de `apps/mobile/src/components/community/CommunityBattles.tsx`.
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Swords } from 'lucide-react'

import { useActiveBattle } from '@calistenia/core/hooks/useActiveBattle'
import { isBattleOngoing } from '@calistenia/core/lib/battle'
import BattleHistoryList from './BattleHistoryList'

export function ActiveBattleRow() {
  const { t } = useTranslation()
  const { data: battle } = useActiveBattle()
  if (!isBattleOngoing(battle)) return null

  const title = battle.status === 'live' ? t('community.battleLive') : t('community.battleLobby')
  const detail = `${battle.config.rounds} ${t('battle.rounds')} · ${battle.config.exercises.length} ${t('battle.exercises')}`
  return (
    <Link
      to={`/battle/${battle.id}`}
      data-testid="active-battle-row"
      aria-label={`${title} · ${detail}`}
      className="flex min-h-[60px] items-center gap-3 rounded-xl border border-sky-400/45 px-4 py-2 hover:bg-sky-400/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="size-2 rounded-full bg-sky-400" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  )
}

export default function CommunityBattles({ userId }: { userId: string }) {
  const { t } = useTranslation()
  return (
    <BattleHistoryList
      userId={userId}
      header={
        <div className="flex flex-col gap-3">
          <ActiveBattleRow />
          <Link
            to="/battle-create"
            className="flex min-h-14 items-center gap-3 rounded-xl border border-lime/40 bg-lime/5 px-4 py-3 hover:bg-lime/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Swords className="size-5 text-lime" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-bebas text-2xl leading-none">{t('battle.newBattle')}</span>
              <span className="block text-xs text-muted-foreground">{t('battle.createHint')}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
          <Link to="/battle-history" className="self-end text-[11px] font-mono uppercase tracking-[2px] text-muted-foreground hover:text-foreground">
            {t('battle.historyTitle')} →
          </Link>
        </div>
      }
    />
  )
}
