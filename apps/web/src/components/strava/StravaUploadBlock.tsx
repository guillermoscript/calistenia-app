import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useStravaStatus, useStravaUpload } from '@calistenia/core/hooks/useStrava'
import { Button } from '../ui/button'
import { stravaErrorKey } from './stravaErrorKey'

/** Bloque «Subir a Strava» de una sesión de cardio PROPIA (#914). */
export function StravaUploadBlock({ userId, sessionId }: { userId: string | null; sessionId: string }) {
  const { t } = useTranslation()
  const { status, loading: statusLoading } = useStravaStatus(userId)
  const { upload, send, sending } = useStravaUpload(userId, sessionId)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  if (statusLoading || !status?.configured) return null

  const doSend = async () => {
    setErrorKey(null)
    try {
      await send()
    } catch (err) {
      setErrorKey(stravaErrorKey(err))
    }
  }

  let body: React.ReactNode
  if (!status.connected) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t('strava.needConnect')}{' '}
        <Link to="/profile" className="underline underline-offset-4 text-foreground">{t('nav.profile', 'Perfil')}</Link>
      </p>
    )
  } else if (sending) {
    body = <Button disabled className="w-full sm:w-auto">{t('strava.uploading')}</Button>
  } else if (upload?.status === 'done') {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">{t('strava.uploaded')}</span>
        {upload.url && (
          <a href={upload.url} target="_blank" rel="noopener noreferrer"
            className="text-sm underline underline-offset-4 text-foreground">
            {t('strava.viewOn')}
          </a>
        )}
      </div>
    )
  } else if (upload?.status === 'processing' || upload?.status === 'failed') {
    body = (
      <div className="space-y-3">
        <p className={upload.status === 'failed' ? 'text-sm text-red-500' : 'text-sm text-muted-foreground'}>
          {t(upload.status === 'failed' ? 'strava.error' : 'strava.processing')}
        </p>
        <Button variant="outline" className="w-full sm:w-auto" onClick={doSend}>{t('strava.retry')}</Button>
      </div>
    )
  } else {
    body = <Button className="w-full sm:w-auto" onClick={doSend}>{t('strava.upload')}</Button>
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3" data-testid="strava-upload-block">
      {body}
      {errorKey && <p className="text-xs text-red-500" role="alert">{t(errorKey)}</p>}
      <p className="text-[10px] text-muted-foreground">{t('strava.poweredBy')}</p>
    </div>
  )
}
