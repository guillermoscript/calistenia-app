import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Progress } from '../ui/progress'
import type { ReferralStats as ReferralStatsType } from '@calistenia/core/hooks/useReferrals'
import { cn } from '../../lib/utils'

interface ReferralStatsProps {
  stats: ReferralStatsType
}

const MILESTONE_STEP = 500

export function ReferralStats({ stats }: ReferralStatsProps) {
  const { t } = useTranslation()
  const nextMilestone = Math.ceil((stats.totalEarned + 1) / MILESTONE_STEP) * MILESTONE_STEP
  const progress = stats.totalEarned > 0 ? Math.min(100, (stats.totalEarned % MILESTONE_STEP) / MILESTONE_STEP * 100) : 0
  // El balance puede ser negativo: `ai_usage` escribe importes negativos.
  const negativeBalance = stats.pointsBalance < 0

  return (
    <Card>
      <CardContent className="p-5 md:p-6">
        <div className="text-[10px] text-muted-foreground tracking-widest mb-4 uppercase">
          {t('referrals.pointsLabel')}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <div className="font-bebas text-3xl text-[hsl(var(--lime))] leading-none">{stats.totalReferred}</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-1">
              {t('referrals.statReferred')}
            </div>
          </div>
          <div>
            <div className={cn(
              'font-bebas text-3xl leading-none',
              negativeBalance ? 'text-red-400' : 'text-[hsl(var(--lime))]',
            )}>
              {stats.pointsBalance}
            </div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-1">
              {t('referrals.statBalance')}
            </div>
          </div>
          <div>
            <div className="font-bebas text-3xl text-[hsl(var(--lime))] leading-none">{stats.totalEarned}</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-1">
              {t('referrals.statEarned')}
            </div>
          </div>
        </div>

        <div className="mb-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{stats.totalEarned} pts</span>
            <span>{nextMilestone} pts</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          {t('referrals.milestoneNote')}
        </p>
      </CardContent>
    </Card>
  )
}
