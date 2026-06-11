/** Pequeña insignia roja para contadores de notificaciones. */
import { View } from 'react-native'
import { Text } from '@/components/ui/text'

interface NotificationBadgeProps {
  count: number
}

export function NotificationBadge({ count }: NotificationBadgeProps) {
  if (count <= 0) return null

  return (
    <View className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-red-500 items-center justify-center px-1">
      <Text className="font-mono text-[9px] leading-none text-white">
        {count > 9 ? '9+' : String(count)}
      </Text>
    </View>
  )
}
