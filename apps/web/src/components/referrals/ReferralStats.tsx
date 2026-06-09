import { Card, CardContent } from '../ui/card'
import { Progress } from '../ui/progress'
import type { ReferralStats as ReferralStatsType } from '../../hooks/useReferrals'

interface ReferralStatsProps {
  stats: ReferralStatsType
}

const MILESTONE_STEP = 500

export function ReferralStats({ stats }: ReferralStatsProps) {
  const nextMilestone = Math.ceil((stats.totalEarned + 1) / MILESTONE_STEP) * MILESTONE_STEP
  const progress = stats.totalEarned > 0 ? Math.min(100, (stats.totalEarned % MILESTONE_STEP) / MILESTONE_STEP * 100) : 0

  return (
    <Card>
      <CardContent className="p-5 md:p-6">
        <div className="text-[10px] text-muted-foreground tracking-widest mb-4 uppercase">TUS PUNTOS</div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <div className="font-bebas text-3xl text-[hsl(var(--lime))] leading-none">{stats.totalReferred}</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-1">Referidos</div>
          </div>
          <div>
            <div className="font-bebas text-3xl text-[hsl(var(--lime))] leading-none">{stats.pointsBalance}</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-1">Balance</div>
          </div>
          <div>
            <div className="font-bebas text-3xl text-[hsl(var(--lime))] leading-none">{stats.totalEarned}</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-1">Total</div>
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
          Tus puntos desbloquearan funciones de IA proximamente
        </p>
      </CardContent>
    </Card>
  )
}
