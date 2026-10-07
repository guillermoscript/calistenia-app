// Bloque «Subir a Strava» del detalle de una sesión de cardio propia (#914).
import { useState } from 'react'
import { View, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { useStravaStatus, useStravaUpload } from '@calistenia/core/hooks/useStrava'
import { StravaApiError } from '@calistenia/core/lib/strava'
import { stravaErrorKey } from '@/lib/strava-flow'

export function StravaUploadBlock({ userId, sessionId }: { userId: string; sessionId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { status } = useStravaStatus(userId)
  const { upload, send, sending } = useStravaUpload(userId, sessionId)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  if (!status?.configured) return null

  const doSend = async () => {
    setErrorKey(null)
    try {
      await send()
    } catch (e) {
      setErrorKey(stravaErrorKey(e instanceof StravaApiError ? e.code : undefined))
    }
  }

  let body
  if (!status.connected) {
    body = (
      <>
        <Text className="text-[13px] text-muted-foreground">{t('strava.needConnect')}</Text>
        <Button variant="outline" className="h-11 self-start px-4" onPress={() => router.push('/profile' as never)}>
          <Text>{t('strava.connect')}</Text>
        </Button>
      </>
    )
  } else if (sending) {
    body = (
      <Button disabled className="h-11 self-start px-4"><Text>{t('strava.uploading')}</Text></Button>
    )
  } else if (upload?.status === 'done') {
    body = (
      <>
        <Text className="font-sans-medium text-foreground">{t('strava.uploaded')}</Text>
        {upload.url ? (
          <Button
            variant="outline"
            className="h-11 self-start px-4"
            onPress={() => { Linking.openURL(upload.url as string).catch(() => {}) }}
          >
            <Text>{t('strava.viewOn')}</Text>
          </Button>
        ) : null}
      </>
    )
  } else if (upload?.status === 'processing') {
    body = (
      <>
        <Text className="text-[13px] text-muted-foreground">{t('strava.processing')}</Text>
        <Button variant="outline" className="h-11 self-start px-4" onPress={() => { void doSend() }}>
          <Text>{t('strava.retry')}</Text>
        </Button>
      </>
    )
  } else if (upload?.status === 'failed') {
    body = (
      <>
        <Text className="text-[13px] text-destructive">{t('strava.error')}</Text>
        <Button variant="outline" className="h-11 self-start px-4" onPress={() => { void doSend() }}>
          <Text>{t('strava.retry')}</Text>
        </Button>
      </>
    )
  } else {
    body = (
      <Button className="h-11 self-start px-4" onPress={() => { void doSend() }}>
        <Text>{t('strava.upload')}</Text>
      </Button>
    )
  }

  return (
    <View className="gap-2 rounded-xl border border-border bg-muted/20 p-4">
      {body}
      {errorKey ? <Text className="text-[13px] text-destructive">{t(errorKey)}</Text> : null}
      <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{t('strava.poweredBy')}</Text>
    </View>
  )
}
