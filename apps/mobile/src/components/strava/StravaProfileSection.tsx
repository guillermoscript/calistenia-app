// Sección «Strava» del perfil (#914). Solo se pinta si el servidor tiene las
// credenciales de Strava (`status.configured`).
import { useState } from 'react'
import { View, Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useStravaStatus } from '@calistenia/core/hooks/useStrava'
import { StravaApiError } from '@calistenia/core/lib/strava'
import { parseStravaReturnUrl, stravaErrorKey, STRAVA_RETURN_TOAST_KEY, STRAVA_RETURN_URL } from '@/lib/strava-flow'

export function StravaProfileSection({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const { status, getConnectUrl, refresh, disconnect, disconnecting } = useStravaStatus(userId)
  const [connecting, setConnecting] = useState(false)

  if (!status?.configured) return null

  const connect = async () => {
    if (connecting) return
    setConnecting(true)
    try {
      const url = await getConnectUrl('mobile')
      const res = await WebBrowser.openAuthSessionAsync(url, STRAVA_RETURN_URL)
      // Cerrar el navegador sin terminar no es un error: no se avisa.
      if (res.type === 'success' && res.url) {
        Alert.alert(t(STRAVA_RETURN_TOAST_KEY[parseStravaReturnUrl(res.url)]))
      }
      await refresh()
    } catch (e) {
      Alert.alert(t(e instanceof StravaApiError ? stravaErrorKey(e.code) : 'strava.connectErrorToast'))
    } finally {
      setConnecting(false)
    }
  }

  const confirmDisconnect = () => {
    Alert.alert(t('strava.disconnectConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('strava.disconnect'),
        style: 'destructive',
        onPress: () => { disconnect().catch((e) => Alert.alert(t(stravaErrorKey((e as StravaApiError)?.code)))) },
      },
    ])
  }

  return (
    <View className="mt-3 gap-2">
      <Kicker>Strava</Kicker>
      <Card className="gap-3 p-4">
        {status.connected ? (
          <>
            <Text className="font-sans-medium text-foreground">{t('strava.connected')}</Text>
            <Button variant="outline" className="h-11 self-start px-4" onPress={confirmDisconnect} disabled={disconnecting}>
              <Text className="font-mono text-xs tracking-[2px] text-foreground">{t('strava.disconnect').toUpperCase()}</Text>
            </Button>
          </>
        ) : (
          <>
            <Text className="text-[13px] text-muted-foreground">{t('strava.connectHint')}</Text>
            <Button className="h-11 self-start px-4" onPress={() => { void connect() }} disabled={connecting}>
              <Text>{t('strava.connect')}</Text>
            </Button>
          </>
        )}
        <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{t('strava.poweredBy')}</Text>
      </Card>
    </View>
  )
}
