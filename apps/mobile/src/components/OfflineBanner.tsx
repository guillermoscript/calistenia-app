// Indicador RN de "sin conexión": un chip flotante centrado bajo el notch
// mientras NetInfo reporte offline. Antes era una franja translúcida a todo el
// ancho pegada arriba, que se solapaba con el header de cada pantalla. Ahora es
// una píldora sólida con sombra → se lee como un badge intencional, no overlap.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react-native'

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
      className="absolute inset-x-0 top-0 z-50 items-center"
      style={{ paddingTop: insets.top + 6 }}
      pointerEvents="none"
    >
      <View
        className="flex-row items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500 px-3 py-1.5"
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        }}
      >
        <WifiOff size={13} color="#000" strokeWidth={2.5} />
        <Text className="font-mono text-[11px] font-semibold tracking-wide text-black">
          {t('offline.message')}
        </Text>
      </View>
    </View>
  )
}
