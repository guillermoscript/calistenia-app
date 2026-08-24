import { useTranslation } from 'react-i18next'
import type { BalanceFamily } from '@calistenia/core/lib/training-stats'
import { cn } from '../../../lib/utils'

interface BalanceBarProps {
  balance: Record<BalanceFamily, number>
}

const FAMILY_ORDER: BalanceFamily[] = ['push', 'pull', 'legs', 'core']

const FAMILY_COLOR: Record<BalanceFamily, string> = {
  push: 'bg-lime',
  pull: 'bg-sky-500',
  legs: 'bg-amber-400',
  core: 'bg-violet-400',
}

const FAMILY_TEXT_COLOR: Record<BalanceFamily, string> = {
  push: 'text-lime',
  pull: 'text-sky-500',
  legs: 'text-amber-400',
  core: 'text-violet-400',
}

/** Barra apilada push/pull/legs/core con leyenda. Segmentos a 0 no se pintan. */
export default function BalanceBar({ balance }: BalanceBarProps) {
  const { t } = useTranslation()
  const families = FAMILY_ORDER.filter(f => balance[f] > 0)

  if (families.length === 0) return null

  return (
    <div>
      <div className="text-[11px] text-muted-foreground mb-2">{t('stats.balance')}</div>
      <div className="h-2.5 rounded-full overflow-hidden flex bg-muted">
        {families.map(f => (
          <div key={f} className={cn('h-full', FAMILY_COLOR[f])} style={{ width: `${balance[f]}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
        {families.map(f => (
          <div key={f} className="flex items-center gap-1.5 text-[11px]">
            <span className={cn('inline-block size-2 rounded-full', FAMILY_COLOR[f])} />
            <span className="text-muted-foreground">{t(`stats.balance.${f}`)}</span>
            <span className={cn('font-mono', FAMILY_TEXT_COLOR[f])}>{balance[f]}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
