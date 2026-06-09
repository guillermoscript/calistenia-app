import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog'
import { Button } from './button'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'default'
  onConfirm: () => void | Promise<void>
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  loading: externalLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const [internalLoading, setInternalLoading] = useState(false)
  const loading = externalLoading || internalLoading
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm')
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel')

  const handleConfirm = async () => {
    const result = onConfirm()
    if (result instanceof Promise) {
      setInternalLoading(true)
      try {
        await result
      } finally {
        setInternalLoading(false)
      }
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent className="max-w-[380px] max-sm:max-w-[90vw]" hideClose>
        <DialogHeader>
          <DialogTitle className="font-bebas text-[26px] tracking-[2px]">{title}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2.5 sm:flex-col pt-2">
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className={
              variant === 'destructive'
                ? 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 font-bebas text-lg tracking-wide'
                : 'bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-lg tracking-wide'
            }
            variant="outline"
          >
            {loading ? t('common.processing') : resolvedConfirmLabel}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="font-mono text-[11px] tracking-wide"
          >
            {resolvedCancelLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
