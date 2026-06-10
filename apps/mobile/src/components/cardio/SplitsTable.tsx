/** Tabla de splits por km — port móvil del SplitsTable web. */
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { formatPace, formatDuration } from '@calistenia/core/lib/geo'
import type { KmSplit } from '@calistenia/core/types'

export default function SplitsTable({ splits }: { splits: KmSplit[] }) {
  if (splits.length === 0) return null
  const slowest = Math.max(...splits.map((s) => s.pace))
  const fastest = Math.min(...splits.map((s) => s.pace))

  return (
    <View className="gap-1.5">
      {splits.map((split, i) => {
        // Barra: más rápido = más larga (normalizada entre el split más lento y el más rápido)
        const ratio = slowest === fastest ? 1 : 0.35 + 0.65 * ((slowest - split.pace) / (slowest - fastest))
        const isFastest = split.pace === fastest && splits.length > 1
        return (
          <View key={i} className="flex-row items-center gap-3">
            <Text className="w-9 font-mono text-[11px] text-muted-foreground">
              {Number.isInteger(split.km) ? `${split.km}` : split.km.toFixed(2)}
            </Text>
            <View className="h-5 flex-1 justify-center">
              <View
                className={isFastest ? 'h-5 justify-center rounded bg-lime/80 px-2' : 'h-5 justify-center rounded bg-lime/25 px-2'}
                style={{ width: `${Math.round(ratio * 100)}%`, minWidth: 56 }}
              >
                <Text className={isFastest ? 'font-mono-semibold text-[10px] text-zinc-900' : 'font-mono text-[10px] text-foreground'}>
                  {formatPace(split.pace)}
                </Text>
              </View>
            </View>
            <Text className="w-12 text-right font-mono text-[11px] text-muted-foreground">
              {formatDuration(split.time_seconds)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
