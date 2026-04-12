import { useTranslation } from 'react-i18next'
import { useRacePRs } from '../../hooks/useRacePRs'
import { formatDuration, formatPace } from '../../lib/geo'

interface Props {
  userId: string | null
}

export default function RacePRsPanel({ userId }: Props) {
  const { t } = useTranslation()
  const { prs, loading } = useRacePRs(userId)

  if (loading) return null
  if (prs.finishes === 0) return null

  return (
    <div className="border border-border rounded-xl p-4 bg-muted/20">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">
          {t('race.prsTitle')}
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          {prs.wins > 0 && (
            <span className="text-lime">👑 {prs.wins} {t('race.prsWins').toUpperCase()}</span>
          )}
          <span className="text-muted-foreground">{prs.finishes} {t('race.prsFinished').toUpperCase()}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <PRCell label="1K" value={prs.best1k ? formatDuration(prs.best1k) : '—'} hasPR={prs.best1k !== null} />
        <PRCell label="5K" value={prs.best5k ? formatDuration(prs.best5k) : '—'} hasPR={prs.best5k !== null} />
        <PRCell label="10K" value={prs.best10k ? formatDuration(prs.best10k) : '—'} hasPR={prs.best10k !== null} />
      </div>

      {(prs.fastestRace || prs.longestRace) && (
        <div className="space-y-1 border-t border-border pt-3">
          {prs.fastestRace && (
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-muted-foreground">{t('race.prsFastestPace')}</span>
              <span className="text-foreground">
                {formatPace(prs.fastestRace.durationSeconds / 60 / prs.fastestRace.distanceKm)} /km
              </span>
            </div>
          )}
          {prs.longestRace && (
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-muted-foreground">{t('race.prsLongest')}</span>
              <span className="text-foreground">{prs.longestRace.distanceKm.toFixed(2)} km</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PRCell({ label, value, hasPR }: { label: string; value: string; hasPR: boolean }) {
  return (
    <div className={`text-center py-2 rounded-lg border ${hasPR ? 'border-lime/30 bg-lime/5' : 'border-border bg-muted/30'}`}>
      <div className={`font-bebas text-xl tabular-nums ${hasPR ? 'text-lime' : 'text-muted-foreground'}`}>
        {value}
      </div>
      <div className="text-[9px] font-mono text-muted-foreground tracking-widest mt-0.5">{label}</div>
    </div>
  )
}
