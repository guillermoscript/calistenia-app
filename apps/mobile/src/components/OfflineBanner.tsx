// Equivalente RN del OfflineBanner de web: franja ámbar bajo el notch
// mientras NetInfo reporte que no hay conexión.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { isOnline, onConnectivityChange } from '@/lib/connectivity'

export default function OfflineBanner() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [offline, setOffline] = useState(!isOnline())

  useEffect(() => onConnectivityChange(now => setOffline(!now)), [])

  if (!offline) return null

  return (
    <View
      className="absolute inset-x-0 top-0 z-50 border-b border-amber-500 bg-amber-500/10"
      style={{ paddingTop: insets.top }}
      pointerEvents="none"
    >
      <Text className="px-4 py-1.5 text-center font-mono text-xs text-amber-400">
        {t('offline.message')}
      </Text>
    </View>
  )
}
