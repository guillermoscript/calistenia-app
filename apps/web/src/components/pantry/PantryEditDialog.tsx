import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { currencySymbol } from '@calistenia/core/lib/money'
import type { PantryItem } from '@calistenia/core/types'

function parseNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function PantryEditDialog({ item, onSave, onDelete, onClose, onVerify, onGone }: {
  item: PantryItem | null
  onSave: (item: PantryItem, qty: number | null, price: number | null) => void
  onDelete: (item: PantryItem) => void
  onClose: () => void
  onVerify: (item: PantryItem) => void
  onGone: (item: PantryItem) => void
}) {
  const { t } = useTranslation()
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const qtyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (item) {
      setQty(item.quantity == null ? '' : String(item.quantity))
      setPrice(item.priceTotal == null ? '' : String(item.priceTotal))
    }
  }, [item])

  if (!item) return null

  return (
    <>
      <Dialog open={item != null} onOpenChange={o => { if (!o) onClose() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t('pantry.editTitle')}</div>
            <DialogTitle className="truncate font-bebas text-2xl">{item.name}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('pantry.quantity')}{item.unit ? ` (${item.unit})` : ''}
              </div>
              <Input
                ref={qtyRef}
                value={qty}
                onChange={e => setQty(e.target.value)}
                inputMode="decimal"
                placeholder="—"
                className="h-11 font-mono text-sm"
              />
            </div>
            <div className="flex-1">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('pantry.price')} $
              </div>
              <Input
                value={price}
                onChange={e => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="—"
                className="h-11 font-mono text-sm"
              />
              {/* multimoneda: lo que dice la factura, tasa del día de la compra */}
              {item.priceOriginal != null && item.currencyOriginal && item.currencyOriginal !== 'USD' && (
                <div className="mt-1 truncate font-mono text-[9px] tracking-wide text-muted-foreground/70">
                  {currencySymbol(item.currencyOriginal)} {item.priceOriginal}
                  {item.exchangeRate != null ? ` @ ${item.exchangeRate}` : ''}
                </div>
              )}
            </div>
          </div>

          {item.confidence === 'low' && (
            <div className="border border-border">
              <div className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('pantry.stillHave.question')}
              </div>
              <div className="flex">
                <button
                  type="button"
                  onClick={() => onVerify(item)}
                  className="h-11 flex-1 border-r border-border font-mono text-[11px] uppercase tracking-[1px] text-lime-400 transition-colors hover:bg-lime-400/10"
                >
                  {t('pantry.stillHave.same')}
                </button>
                <button
                  type="button"
                  onClick={() => qtyRef.current?.focus()}
                  className="h-11 flex-1 border-r border-border font-mono text-[11px] uppercase tracking-[1px] text-foreground transition-colors hover:bg-muted/20"
                >
                  {t('pantry.stillHave.less')}
                </button>
                <button
                  type="button"
                  onClick={() => onGone(item)}
                  className="h-11 flex-1 font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground transition-colors hover:bg-muted/20"
                >
                  {t('pantry.stillHave.gone')}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(true)}
              className="flex-1 font-mono text-xs uppercase tracking-[2px] text-muted-foreground"
            >
              {t('pantry.delete')}
            </Button>
            <Button
              onClick={() => onSave(item, parseNum(qty), parseNum(price))}
              className="flex-1 bg-lime-400 font-mono text-xs uppercase tracking-[2px] text-zinc-900 hover:bg-lime-300"
            >
              {t('pantry.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t('pantry.deleteTitle')}
        description={item.name}
        confirmLabel={t('pantry.delete')}
        variant="destructive"
        onConfirm={() => onDelete(item)}
      />
    </>
  )
}
