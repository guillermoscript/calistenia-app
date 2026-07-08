/**
 * PantryDepleteDialog — F4 (#173), port web del sheet mobile. Tras loguear una
 * comida, el usuario revisa/edita las filas de depleción matcheadas por AI
 * antes de confirmar el descuento de stock. Nunca descuenta sin confirmar.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { cn } from '../../lib/utils'
import type { PantryItem } from '@calistenia/core/types'
import type { DepleteRow } from './use-pantry-depletion'

function parseNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

interface RowState { checked: boolean; qty: string }

export function PantryDepleteDialog({ rows, onConfirm, onDismiss }: {
  rows: DepleteRow[] | null
  onConfirm: (selected: { item: PantryItem; qtyConsumed: number }[]) => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<RowState[]>([])
  const [invalid, setInvalid] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (rows) {
      setState(rows.map((r) => ({ checked: r.checked, qty: r.qtyConsumed == null ? '' : String(r.qtyConsumed) })))
      setInvalid(new Set())
    }
  }, [rows])

  if (!rows || rows.length === 0 || state.length !== rows.length) return null

  const toggle = (i: number) =>
    setState((s) => s.map((r, j) => (j === i ? { ...r, checked: !r.checked } : r)))
  const setQty = (i: number, v: string) =>
    setState((s) => s.map((r, j) => (j === i ? { ...r, qty: v } : r)))

  const handleConfirm = () => {
    // Filas marcadas sin qty válida: NUNCA descartar en silencio — resaltar y esperar input.
    const bad = new Set<number>()
    const selected = rows.flatMap((r, i) => {
      if (!state[i].checked) return []
      const qty = parseNum(state[i].qty)
      if (qty == null || qty <= 0) { bad.add(i); return [] }
      return [{ item: r.item, qtyConsumed: qty }]
    })
    if (bad.size > 0) { setInvalid(bad); return }
    if (selected.length > 0) onConfirm(selected)
    else onDismiss() // nada marcado = omitir
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onDismiss() }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="text-[10px] font-mono text-muted-foreground tracking-[3px] uppercase">
            {t('pantry.deplete.kicker')}
          </div>
          <DialogTitle className="font-bebas text-2xl tracking-wide">{t('pantry.deplete.title')}</DialogTitle>
          <DialogDescription className="text-xs">{t('pantry.deplete.subtitle')}</DialogDescription>
        </DialogHeader>

        <div>
          {rows.map((r, i) => (
            <div key={r.item.id} className="flex items-center gap-3 border-t border-border py-3">
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={state[i].checked}
                className={cn(
                  'size-6 shrink-0 flex items-center justify-center border transition-colors',
                  state[i].checked ? 'border-lime bg-lime' : 'border-border hover:border-lime/40',
                )}
              >
                {state[i].checked && <Check className="size-3.5 text-black" strokeWidth={3} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{r.item.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground truncate">
                  {r.matchedFood}{r.confidence === 'low' ? ' · ?' : ''}
                </div>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={state[i].qty}
                onChange={(e) => {
                  setQty(i, e.target.value)
                  if (invalid.has(i)) setInvalid(new Set([...invalid].filter((j) => j !== i)))
                }}
                placeholder="—"
                className={cn(
                  'h-10 w-20 rounded-md border bg-background px-2 text-right font-mono text-sm text-foreground',
                  invalid.has(i) ? 'border-destructive' : 'border-input',
                )}
              />
              <span className="w-12 font-mono text-[10px] text-muted-foreground">{r.item.unit ?? ''}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onDismiss}
            className="h-11 flex-1 flex items-center justify-center border border-border hover:bg-muted/20 font-mono text-xs uppercase tracking-[2px] text-muted-foreground transition-colors"
          >
            {t('pantry.deplete.skip')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="h-11 flex-1 flex items-center justify-center bg-lime hover:bg-lime/80 font-mono text-xs uppercase tracking-[2px] text-black transition-colors"
          >
            {t('pantry.deplete.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
