/** Barras horizontales por grupo muscular — ancho proporcional a `share`. */
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { getMuscleGroupLabelKey } from '@calistenia/core/lib/muscles'
import type { MuscleStat } from '@calistenia/core/lib/training-stats'

interface Props {
  groups: MuscleStat[]
}

export function MuscleBars({ groups }: Props) {
  const { t } = useTranslation()
  if (groups.length === 0) return null

  return (
    <View className="gap-2.5">
      {groups.map((g) => (
        <View key={g.group} className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="font-sans-medium text-xs text-foreground" numberOfLines={1}>
              {t(getMuscleGroupLabelKey(g.group))}
            </Text>
            <Text className="font-mono text-[10px] text-muted-foreground">{g.sets}</Text>
          </View>
          <View className="h-1.5 overflow-hidden rounded-full bg-muted/40">
            <View
              className="h-full rounded-full bg-lime"
              style={{ width: `${Math.max(2, Math.round(g.share * 100))}%` }}
            />
          </View>
        </View>
      ))}
    </View>
  )
}
