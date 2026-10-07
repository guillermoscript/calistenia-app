import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useStravaStatus } from '@calistenia/core/hooks/useStrava'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'

const RETURN_TOASTS = {
  connected: ['success', 'strava.connectedToast'],
  denied: ['error', 'strava.deniedToast'],
  error: ['error', 'strava.connectErrorToast'],
} as const

/**
 * Tarjeta «Strava» del perfil (#914). Solo aparece si el servidor tiene las
 * credenciales. También recoge el `?strava=…` con el que el servidor devuelve
 * al usuario tras la autorización.
 */
export function StravaCard({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const { status, getConnectUrl, refresh, disconnect, disconnecting } = useStravaStatus(userId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [failed, setFailed] = useState(false)

  const returned = searchParams.get('strava')
  useEffect(() => {
    if (!returned) return
    const entry = RETURN_TOASTS[returned as keyof typeof RETURN_TOASTS]
    if (entry) {
      toast[entry[0]](t(entry[1]))
      void refresh()
    }
    const next = new URLSearchParams(searchParams)
    next.delete('strava')
    setSearchParams(next, { replace: true })
    // Solo reacciona al param; `t`/`refresh` cambian de identidad sin que haya nada que repetir.
  }, [returned]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!status?.configured) return null

  const connect = async () => {
    setFailed(false)
    setConnecting(true)
    try {
      const url = await getConnectUrl('web')
      window.location.href = url
    } catch {
      setFailed(true)
      setConnecting(false)
    }
  }

  const doDisconnect = async () => {
    try {
      await disconnect()
      setConfirmOpen(false)
    } catch {
      toast.error(t('strava.error'))
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm font-medium">
            {status.connected ? t('strava.connected') : 'Strava'}
          </div>
          {status.connected ? (
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setConfirmOpen(true)}>
              {t('strava.disconnect')}
            </Button>
          ) : (
            <Button size="sm" className="shrink-0" disabled={connecting} onClick={connect}>
              {t('strava.connect')}
            </Button>
          )}
        </div>
        {!status.connected && <p className="text-[11px] text-muted-foreground">{t('strava.connectHint')}</p>}
        {failed && <p className="text-[11px] text-red-500" role="alert">{t('strava.connectErrorToast')}</p>}
        <p className="text-[10px] text-muted-foreground">{t('strava.poweredBy')}</p>
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('strava.disconnect')}
        description={t('strava.disconnectConfirm')}
        confirmLabel={t('strava.disconnect')}
        variant="destructive"
        loading={disconnecting}
        onConfirm={doDisconnect}
      />
    </Card>
  )
}
