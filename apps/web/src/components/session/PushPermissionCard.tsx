import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PushPermissionState } from '@calistenia/core/lib/push-prompt'
import { markPushPromptSeen, shouldShowPushPrompt, trackPushPromptAnswered, trackPushPromptViewed } from '@calistenia/core/lib/push-prompt'
import { Button } from '../ui/button'
import { getNotificationSupport, requestNotificationPermission, subscribeToPush } from '../../lib/push-subscription'

interface Props {
  userId: string | null | undefined
  workoutKey: string
  totalSessions: number
}

function currentPermission(): PushPermissionState {
  const { notifications, permission } = getNotificationSupport()
  if (!notifications) return 'unsupported'
  if (permission === 'granted') return 'granted'
  if (permission === 'denied') return 'denied'
  return 'undetermined'
}

/**
 * Tarjeta que ofrece el permiso de notificaciones en la celebración del
 * primer entreno (#694). Ver `push-prompt.ts`: se ofrece una sola vez por
 * usuario y dispositivo, y solo si el sistema todavía no decidió.
 */
export default function PushPermissionCard({ userId, workoutKey, totalSessions }: Props) {
  const { t } = useTranslation()
  const { vapidConfigured } = getNotificationSupport()
  // Se decide una sola vez al montar: si el usuario acepta o rechaza durante
  // esta pantalla, la tarjeta sigue mostrando el resultado hasta que se oculta
  // sola, no desaparece de golpe porque `shouldShowPushPrompt` reevalúe.
  const [visible, setVisible] = useState(() =>
    shouldShowPushPrompt({ userId, permission: currentPermission() }),
  )
  const [result, setResult] = useState<'granted' | 'denied' | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (visible) trackPushPromptViewed({ workoutKey, totalSessions })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez, al montar visible
  }, [])

  useEffect(() => {
    if (!result) return
    const timer = window.setTimeout(() => setVisible(false), 2500)
    return () => window.clearTimeout(timer)
  }, [result])

  if (!visible) return null

  const handleAccept = async () => {
    if (!userId || busy) return
    setBusy(true)
    markPushPromptSeen(userId)
    const ok = vapidConfigured ? await subscribeToPush(userId) : await requestNotificationPermission()
    trackPushPromptAnswered({ result: ok ? 'granted' : 'denied', workoutKey })
    setResult(ok ? 'granted' : 'denied')
    setBusy(false)
  }

  const handleDecline = () => {
    if (!userId) return
    markPushPromptSeen(userId)
    trackPushPromptAnswered({ result: 'dismissed', workoutKey })
    setVisible(false)
  }

  return (
    <div
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      className="w-full max-w-[380px] rounded-xl border border-border bg-card p-4"
      style={{ animation: 'fadeUp 0.5s 0.55s ease-out both' }}
    >
      <div className="text-[9px] font-mono tracking-[3px] text-muted-foreground uppercase mb-2">
        {t('pushPrompt.title')}
      </div>

      {result ? (
        <div className="text-sm text-foreground/80 py-1">
          {result === 'granted' ? t('pushPrompt.granted') : t('pushPrompt.denied')}
        </div>
      ) : (
        <>
          <div className="text-sm text-foreground/80 mb-3">{t('pushPrompt.desc')}</div>
          <div className="flex gap-2">
            <Button
              variant="limeSolid"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); void handleAccept() }}
              disabled={busy}
              className="flex-1 h-10 font-mono text-xs tracking-wide"
            >
              {t('pushPrompt.accept')}
            </Button>
            <Button
              variant="outline"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDecline() }}
              disabled={busy}
              className="flex-1 h-10 font-mono text-xs tracking-wide"
            >
              {t('pushPrompt.decline')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
