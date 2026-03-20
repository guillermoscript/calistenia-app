import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'default'
  onConfirm: () => void
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px] max-sm:max-w-[90vw]" hideClose>
        <DialogHeader>
          <DialogTitle className="font-bebas text-[26px] tracking-[2px]">{title}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2.5 sm:flex-col pt-2">
          <Button
            onClick={() => { onConfirm(); onOpenChange(false) }}
            disabled={loading}
            className={
              variant === 'destructive'
                ? 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 font-bebas text-lg tracking-wide'
                : 'bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-lg tracking-wide'
            }
            variant="outline"
          >
            {loading ? 'Procesando...' : confirmLabel}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-mono text-[11px] tracking-wide"
          >
            {cancelLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
