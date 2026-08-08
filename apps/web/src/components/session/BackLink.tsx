import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'

/** Enlace "volver" compartido por las vistas de detalle de sesión. */
export default function BackLink({ onClick, className }: { onClick: () => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className={cn('text-sm text-muted-foreground hover:text-foreground flex items-center gap-1', className)}
    >
      <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="10,3 5,8 10,13" /></svg>
      {t('common.back')}
    </button>
  )
}
