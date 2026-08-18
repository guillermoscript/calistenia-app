import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'

interface DiscardSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  setsCount: number
  onConfirm: () => void
}

/** Confirmación de descarte de la sesión en curso. */
export default function DiscardSessionDialog({ open, onOpenChange, setsCount, onConfirm }: DiscardSessionDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[320px] max-sm:max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="font-bebas text-[28px] tracking-[2px]">{t('session.discardTitle')}</DialogTitle>
          <DialogDescription>
            {setsCount > 0
              ? t('session.discardWithSets', { count: setsCount })
              : t('session.discardEmpty')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2.5 sm:flex-col">
          <Button
            variant="outline"
            onClick={onConfirm}
            className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 font-bebas text-lg tracking-wide"
          >
            {t('session.discardButton')}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-mono text-[11px] tracking-wide"
          >
            CONTINUAR ENTRENANDO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
