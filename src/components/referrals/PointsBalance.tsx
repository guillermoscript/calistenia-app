import { cn } from '../../lib/utils'

interface PointsBalanceProps {
  balance: number
  className?: string
}

export function PointsBalance({ balance, className }: PointsBalanceProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      'bg-lime/10 text-lime border border-lime/20',
      className,
    )}>
      <StarIcon className="size-3" />
      {balance}
    </span>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.85 5L8 12.4 3.55 14.7l.85-5L.8 6.2l5-.7z" />
    </svg>
  )
}
