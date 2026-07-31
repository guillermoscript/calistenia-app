import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { matchesAccountEmail } from '@calistenia/core/lib/account'
import { useDeleteAccount } from '@calistenia/core/hooks/useDeleteAccount'

interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  email: string | null | undefined
  /** Se llama tras una baja correcta; la página decide a dónde ir. */
  onDeleted: () => void
}

/**
 * Confirmación de baja de cuenta (issue #300).
 *
 * La confirmación es escribir el email entero, no un "¿seguro?": el borrado es
 * inmediato e irreversible, y no hay copia de seguridad de la que tirar. El
 * diálogo enumera antes lo que se va con la cuenta, para que la decisión se
 * tome con la lista delante y no después.
 */
export function DeleteAccountDialog({ open, onOpenChange, email, onDeleted }: DeleteAccountDialogProps) {
  const { t } = useTranslation()
  const { deleteAccount, deleting } = useDeleteAccount()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)

  const confirmed = matchesAccountEmail(typed, email)

  const handleOpenChange = (next: boolean) => {
    if (deleting) return // no cerrar a media baja
    if (!next) {
      setTyped('')
      setError(null)
    }
    onOpenChange(next)
  }

  const handleDelete = async () => {
    if (!confirmed || deleting) return
    setError(null)
    try {
      await deleteAccount()
      onDeleted()
    } catch {
      setError(t('account.deleteError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">{t('account.deleteTitle')}</DialogTitle>
          <DialogDescription>{t('account.deleteIntro')}</DialogDescription>
        </DialogHeader>

        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>{t('account.deleteBullet1')}</li>
          <li>{t('account.deleteBullet2')}</li>
          <li>{t('account.deleteBullet3')}</li>
        </ul>

        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-account-email">
            {t('account.deleteConfirmLabel', { email: email ?? '' })}
          </Label>
          <Input
            id="delete-account-email"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={email ?? ''}
            autoComplete="off"
            spellCheck={false}
            disabled={deleting}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={deleting}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!confirmed || deleting}>
            {deleting ? t('account.deleting') : t('account.deleteConfirmCta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
