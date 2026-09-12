/** Barra apilada push / pull / legs / core con leyenda de porcentajes. */
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import type { BalanceFamily } from '@calistenia/core/lib/training-stats'

interface Props {
  balance: Record<BalanceFamily, number>
}

const FAMILIES: readonly BalanceFamily[] = ['push', 'pull', 'legs', 'core']

const FAMILY_BG: Record<BalanceFamily, string> = {
  push: 'bg-lime',
  pull: 'bg-sky-500',
  legs: 'bg-amber-400',
  core: 'bg-violet-500',
}

const FAMILY_TEXT: Record<BalanceFamily, string> = {
  push: 'text-lime',
  pull: 'text-sky-500',
  legs: 'text-amber-400',
  core: 'text-violet-500',
}

export function BalanceBar({ balance }: Props) {
  const { t } = useTranslation()
  const active = FAMILIES.filter((f) => balance[f] > 0)
  if (active.length === 0) return null

  return (
    <View className="gap-2">
      <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {t('stats.balance')}
      </Text>
      <View className="h-2.5 flex-row overflow-hidden rounded-full bg-muted/40">
        {active.map((f) => (
          <View key={f} className={cn('h-full', FAMILY_BG[f])} style={{ width: `${balance[f]}%` }} />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
        {active.map((f) => (
          <View key={f} className="flex-row items-center gap-1.5">
            <View className={cn('size-2 rounded-full', FAMILY_BG[f])} />
            <Text className="font-mono text-[10px] text-muted-foreground">
              {t(`stats.balance.${f}`)}{' '}
              <Text className={cn('font-mono text-[10px]', FAMILY_TEXT[f])}>{balance[f]}%</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
