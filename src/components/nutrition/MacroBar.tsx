import { cn } from '../../lib/utils'
import { Progress } from '../ui/progress'

interface MacroBarProps {
  label: string
  current: number
  target: number
  unit?: string
  color: string // tailwind color class like 'bg-sky-500'
}

export default function MacroBar({ label, current, target, unit = 'g', color }: MacroBarProps) {
  const pct = target > 0 ? (current / target) * 100 : 0
  const clampedPct = Math.min(pct, 100)

  // Color changes based on percentage
  const barColor = pct > 100
    ? 'text-red-500'
    : pct >= 80
      ? 'text-amber-400'
      : 'text-emerald-500'

  // Map color prop to indicator override
  const indicatorColor = pct > 100
    ? '[&>div]:bg-red-500'
    : pct >= 80
      ? '[&>div]:bg-amber-400'
      : color.replace('bg-', '[&>div]:bg-')

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] text-muted-foreground tracking-widest uppercase">{label}</span>
        <span className="text-xs">
          <span className={cn('font-medium', barColor)}>{Math.round(current)}</span>
          <span className="text-muted-foreground"> / {target}{unit}</span>
        </span>
      </div>
      <Progress value={clampedPct} className={cn('h-2', indicatorColor)} />
    </div>
  )
}
