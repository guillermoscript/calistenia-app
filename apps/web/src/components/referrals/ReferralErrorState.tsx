import { useTranslation } from 'react-i18next'
import { AlertTriangle, RotateCw } from 'lucide-react'
import type { ReferralDataError } from '@calistenia/core/hooks/useReferrals'

interface ReferralErrorStateProps {
  error: ReferralDataError | Error
  onRetry: () => void
  retrying?: boolean
}

/**
 * Estado de fallo con reintento. Existe porque una lista vacía y «no pude leer
 * la lista» no son lo mismo: mostrar 0 referidos cuando PocketBase está caído
 * sería mentir sobre el dato.
 */
export function ReferralErrorState({ error, onRetry, retrying }: ReferralErrorStateProps) {
  const { t } = useTranslation()
  const offline = (error as ReferralDataError)?.reason === 'offline'

  return (
    <div
      role="alert"
      className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-start gap-3"
    >
      <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{t('referrals.errorTitle')}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {offline ? t('referrals.errorOffline') : t('referrals.errorGeneric')}
        </p>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted text-xs font-medium hover:text-foreground hover:border-border/70 transition-colors disabled:opacity-50"
        >
          <RotateCw className={retrying ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {t('referrals.retry')}
        </button>
      </div>
    </div>
  )
}
