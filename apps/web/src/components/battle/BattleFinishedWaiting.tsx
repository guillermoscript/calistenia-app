/** Tu circuito ha terminado pero la batalla sigue viva (#404, #432): manda el puesto. */
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { battleDisplayRanks, battleSpanMs, battleWorkColumns, formatBattleElapsed } from '@calistenia/core/lib/battle'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Kicker } from '../ui/kicker'
import { useBattleContext } from './BattleContext'
import BattleStandingsList from './BattleStandingsList'

export default function BattleFinishedWaiting() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { snapshot, standings } = useBattleContext()

  const me = snapshot?.me ?? null
  const config = snapshot?.battle.config
  if (!snapshot || !config || !me) return null

  const walkedAway = me.status === 'left'
  const mine = standings.find(entry => entry.user === me.user) ?? null
  // El reloj se para donde paraste tú, no donde va la batalla.
  const elapsed = battleSpanMs(snapshot.battle.starts_at, walkedAway ? me.left_at : me.finished_at)
  const stillGoing = standings.filter(entry => entry.status === 'active').length

  const myStanding = walkedAway ? null : mine
  const myRank = myStanding ? battleDisplayRanks(standings).get(myStanding.participant_id) ?? myStanding.rank : null
  const title = myRank !== null
    ? t('battle.rankOf', { rank: myRank, total: standings.length })
    : walkedAway ? t('battle.youLeftTitle') : t('battle.youFinishedTitle')
  const kicker = myStanding ? t('battle.position') : t('battle.stillLive')

  const columns = battleWorkColumns(config)
  const stats = myStanding
    ? [
      { label: t('battle.roundsDone'), value: String(myStanding.score.completed_rounds) },
      ...(columns.reps ? [{ label: t('battle.reps'), value: String(myStanding.score.completed_reps) }] : []),
      ...(columns.seconds ? [{ label: t('battle.workDone'), value: `${myStanding.score.completed_time_seconds}s` }] : []),
      { label: t('battle.duration'), value: formatBattleElapsed(elapsed) },
    ]
    : []

  return (
    <div className="flex flex-col pb-6">
      <header className="border-b border-border pb-4 pt-2">
        <Kicker tone="lime" size="xs">{kicker}</Kicker>
        <h1 className={cn('font-bebas text-5xl leading-none mt-1', myRank === 1 ? 'text-lime' : 'text-foreground')}>{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {stillGoing > 0 ? t('battle.waitingForOthers') : t('battle.waitingClosing')}
        </p>
      </header>

      <Kicker className="mb-2 mt-5">{t('battle.liveStandings')}</Kicker>
      <BattleStandingsList standings={standings} config={config} meUserId={me.user} />

      {myStanding && (
        <section className="mt-5">
          <Kicker className="mb-3">{t('battle.yourScore')}</Kicker>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
            {stats.map(stat => (
              <div key={stat.label}>
                <dt><Kicker size="xs">{stat.label}</Kicker></dt>
                <dd className="font-bebas text-2xl leading-none mt-1">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <Button variant="ghost" className="mt-6 h-12 border-t border-border rounded-none font-bebas text-xl tracking-widest uppercase text-lime" onClick={() => navigate('/')}>
        {t('battle.leaveScreen')}
      </Button>
      <p className="text-center font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">{t('battle.leaveScreenHint')}</p>
    </div>
  )
}
