import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrivateAccount } from '@calistenia/core/hooks/usePrivateAccount'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'

/**
 * Interruptor «cuenta privada» (#422). Público por defecto; al activarlo,
 * seguirte requiere aprobación y tu actividad solo la ven los seguidores
 * aceptados. Mismo switch visual que `NotificationSettingsPage`.
 */
export function PrivateAccountCard({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const { isPrivate, saving, setPrivate } = usePrivateAccount(userId)
  const [error, setError] = useState(false)

  const toggle = async () => {
    setError(false)
    const ok = await setPrivate(!isPrivate)
    if (!ok) setError(true)
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl">🔒</span>
            <div className="min-w-0">
              <div className="text-sm font-medium">{t('privacy.privateAccount')}</div>
              <div className="text-[10px] text-muted-foreground">
                {isPrivate ? t('privacy.privateAccountDesc') : t('privacy.publicAccountDesc')}
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isPrivate}
            aria-label={t('privacy.privateAccount')}
            disabled={saving || !userId}
            onClick={toggle}
            className="shrink-0 flex items-center justify-center w-11 h-11 -mr-2 disabled:opacity-50"
          >
            <div className={cn(
              'w-9 h-[22px] rounded-full relative transition-colors',
              isPrivate ? 'bg-lime-400' : 'bg-muted-foreground/20',
            )}>
              <div className={cn(
                'absolute top-[2px] size-[18px] rounded-full bg-white transition-transform shadow-sm',
                isPrivate ? 'translate-x-[16px]' : 'translate-x-[2px]',
              )} />
            </div>
          </button>
        </div>
        {isPrivate && (
          <p className="text-[11px] text-muted-foreground mt-3">{t('privacy.privateNote')}</p>
        )}
        {error && (
          <p className="text-[11px] text-red-500 mt-2" role="alert">{t('privacy.saveError')}</p>
        )}
      </CardContent>
    </Card>
  )
}
