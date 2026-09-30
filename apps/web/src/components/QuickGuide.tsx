import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MOBILE_TABS } from '../lib/nav-routes'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

/** Una línea por pestaña; la clave va por ruta para no depender del orden. */
const LINE_KEY: Record<string, string> = {
  '/': 'quickGuide.today',
  '/workout': 'quickGuide.workout',
  '/nutrition': 'quickGuide.nutrition',
  '/progress': 'quickGuide.progress',
  '/community': 'quickGuide.community',
}

/**
 * Guía rápida (#856): sustituye al tour automático y al botón «?». Es una hoja
 * estática que se abre a mano desde Perfil, sin superposiciones sobre la
 * interfaz. El `Dialog` de Radix atrapa el foco y se cierra con Esc.
 */
export function QuickGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-bebas text-3xl tracking-wide">{t('quickGuide.title')}</DialogTitle>
          <DialogDescription>{t('quickGuide.desc')}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y divide-border">
          {MOBILE_TABS.map(({ path, labelKey, icon: Icon }) => (
            <li key={path} className="flex items-center gap-3 py-3">
              <span className="size-9 rounded-lg border border-border flex items-center justify-center shrink-0">
                <Icon className="size-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{t(labelKey)}</span>
                <span className="block text-xs text-muted-foreground">{t(LINE_KEY[path])}</span>
              </span>
              <Button
                variant="outline" size="sm" className="h-9 shrink-0"
                aria-label={t('quickGuide.goTo', { tab: t(labelKey) })}
                onClick={() => { onOpenChange(false); navigate(path) }}
              >
                {t('quickGuide.go')}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
