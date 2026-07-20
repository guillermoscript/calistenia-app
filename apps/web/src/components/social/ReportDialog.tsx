import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Flag } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { REPORT_REASONS, type ReportReason } from '@calistenia/core/hooks/useReports'

interface ReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Envía la denuncia; true = éxito (o duplicada, idempotente). */
  onSubmit: (reason: ReportReason) => Promise<boolean>
}

const REASON_KEY: Record<ReportReason, string> = {
  spam: 'reports.reasonSpam',
  harassment: 'reports.reasonHarassment',
  inappropriate: 'reports.reasonInappropriate',
  other: 'reports.reasonOther',
}

/** Selector de motivo de denuncia (#220): elegir motivo = enviar. */
export function ReportDialog({ open, onOpenChange, onSubmit }: ReportDialogProps) {
  const { t } = useTranslation()
  const [sending, setSending] = useState(false)

  const handlePick = async (reason: ReportReason) => {
    if (sending) return
    setSending(true)
    try {
      const ok = await onSubmit(reason)
      if (ok) toast.success(t('reports.successTitle'), { description: t('reports.success') })
      else toast.error(t('reports.error'))
    } finally {
      setSending(false)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={sending ? undefined : onOpenChange}>
      <DialogContent className="max-w-[380px] max-sm:max-w-[90vw]" hideClose>
        <DialogHeader>
          <div className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('reports.pickerKicker')}
          </div>
          <DialogTitle className="font-bebas text-[26px] tracking-[2px]">
            {t('reports.pickerTitle')}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('reports.pickerTitle')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5 pt-2">
          {REPORT_REASONS.map(reason => (
            <Button
              key={reason}
              variant="outline"
              disabled={sending}
              onClick={() => handlePick(reason)}
              className="justify-start gap-2 font-mono text-[11px] tracking-wide hover:border-red-500/60 hover:text-red-500"
            >
              <Flag className="size-3.5" />
              {t(REASON_KEY[reason])}
            </Button>
          ))}
          <Button
            variant="outline"
            disabled={sending}
            onClick={() => onOpenChange(false)}
            className="font-mono text-[11px] tracking-wide text-muted-foreground"
          >
            {t('reports.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
