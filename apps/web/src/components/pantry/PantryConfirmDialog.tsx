import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { PANTRY_CATEGORY_ORDER, normalizePantryName } from '@calistenia/core/lib/pantry'
import { currencySymbol } from '@calistenia/core/lib/money'
import { formatMoney } from '@calistenia/core/lib/shopping'
import { cn } from '../../lib/utils'
import type { PantryItem, PantryParsedItem, PantryParseResult, PantryUnit } from '@calistenia/core/types'

const UNITS: (PantryUnit | null)[] = [null, 'g', 'kg', 'ml', 'l', 'unidad', 'paquete']

export interface ConsumeMatch {
  parsed: PantryParsedItem
  match: PantryItem | null
}

function parseNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function PantryConfirmDialog({
  open, result, matches, onConfirmAdd, onConfirmConsume, onClose, busy, receipt, pricing,
}: {
  open: boolean
  result: PantryParseResult | null
  matches: ConsumeMatch[]
  /** rateUsed: unidades de pricing.currency por 1 USD; null si los precios ya son USD. */
  onConfirmAdd: (items: PantryParsedItem[], rateUsed: number | null) => void
  onConfirmConsume: () => void
  onClose: () => void
  busy: boolean
  /** F5 (#174): metadata de recibo. null/ausente = flujo chat de F1 sin cambios. */
  receipt?: { storeName: string | null; purchaseDate: string | null; ignoredLines: string[] } | null
  /** Multimoneda: moneda ORIGINAL de los precios del draft + prefill de tasa a USD. */
  pricing: { currency: string; prefillRate: number | null }
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<PantryParsedItem[]>([])
  const [showRaw, setShowRaw] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const [rateStr, setRateStr] = useState('')

  useEffect(() => {
    if (result?.intent === 'add') {
      setDraft(result.items); setShowRaw(false); setShowIgnored(false)
      setRateStr(pricing.prefillRate != null ? String(pricing.prefillRate) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill solo al abrir un result nuevo
  }, [result])

  if (!result) return null
  const isAdd = result.intent === 'add'
  const matched = matches.filter(m => m.match != null)
  const currency = pricing.currency
  const rate = parseNum(rateStr)
  const hasPrices = draft.some(d => d.price_total != null)
  // precios en moneda ≠ USD exigen tasa: sin ella el $ de referencia sería inventado
  const needsRate = isAdd && currency !== 'USD' && hasPrices
  const rateOk = !needsRate || (rate != null && rate > 0)
  const totalOriginal = draft.reduce((acc, d) => acc + (d.price_total ?? 0), 0)
  const totalUsd = needsRate && rate != null && rate > 0 ? totalOriginal / rate : null
  const canConfirm = (isAdd ? (draft.length > 0 && draft.every(d => d.name.trim().length > 0)) : matched.length > 0) && rateOk

  const updateDraft = (idx: number, patch: Partial<PantryParsedItem>) => {
    setDraft(d => d.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  // F5: fila de recibo con datos incompletos → pedir revisión explícita del usuario
  const needsReview = (it: PantryParsedItem) =>
    receipt != null && (it.confidence === 'low' || it.price_total == null || it.quantity == null || it.unit == null)

  const removeDraft = (idx: number) => setDraft(d => d.filter((_, i) => i !== idx))

  const confirm = () => {
    if (isAdd) onConfirmAdd(draft, needsRate ? rate : null)
    else onConfirmConsume()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t('pantry.title')}</div>
          <DialogTitle className="font-bebas text-2xl">
            {isAdd ? t('pantry.confirmAddTitle') : t('pantry.confirmConsumeTitle')}
          </DialogTitle>
          {receipt && (receipt.storeName || receipt.purchaseDate) && (
            <div className="truncate font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {[receipt.storeName, receipt.purchaseDate].filter(Boolean).join(' · ')}
            </div>
          )}
        </DialogHeader>

        {needsRate && (
          <div className="flex items-center gap-2 border-b border-border py-3">
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">1 USD =</span>
            <Input
              value={rateStr}
              onChange={e => setRateStr(e.target.value)}
              inputMode="decimal"
              placeholder="—"
              className={cn('h-9 w-24 text-center font-mono text-xs', !rateOk && 'border-amber-400/60')}
            />
            <span className="font-mono text-[10px] text-muted-foreground">{currencySymbol(currency)}</span>
            {totalUsd != null && (
              <span className="ml-auto font-mono text-[11px] text-lime-400">≈ ${formatMoney(totalUsd)}</span>
            )}
          </div>
        )}

        {isAdd && receipt && draft.some(d => (d as { raw_line?: string }).raw_line) && (
          <button type="button" onClick={() => setShowRaw(v => !v)} className="self-start pb-1 pt-2">
            <span className="font-mono text-[9px] uppercase tracking-[2px] text-lime-400/80">
              {showRaw ? t('pantry.receipt.hideRaw') : t('pantry.receipt.showRaw')}
            </span>
          </button>
        )}

        <div>
          {isAdd ? (
            // key estable por índice: name_normalized cambia con cada tecla y remontaría la fila
            draft.map((it, i) => (
              <div key={`row-${i}`} className="border-b border-border py-3">
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={it.name}
                    onChange={e => updateDraft(i, { name: e.target.value, name_normalized: normalizePantryName(e.target.value) })}
                    placeholder={t('pantry.namePlaceholder')}
                    className="min-w-0 flex-1 bg-transparent p-0 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraft(i, {
                        category: PANTRY_CATEGORY_ORDER[(PANTRY_CATEGORY_ORDER.indexOf(it.category) + 1) % PANTRY_CATEGORY_ORDER.length],
                      })}
                      className="font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
                    >
                      {t(`pantry.categories.${it.category}`)}
                    </button>
                    <button type="button" onClick={() => removeDraft(i)} className="p-1 text-muted-foreground hover:text-foreground">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={it.quantity == null ? '' : String(it.quantity)}
                    onChange={e => updateDraft(i, { quantity: parseNum(e.target.value) })}
                    inputMode="decimal"
                    placeholder="—"
                    className="h-9 w-16 text-center font-mono text-xs"
                  />
                  <Input
                    value={it.price_total == null ? '' : String(it.price_total)}
                    onChange={e => updateDraft(i, { price_total: parseNum(e.target.value) })}
                    inputMode="decimal"
                    placeholder="$"
                    className="h-9 w-24 text-center font-mono text-xs"
                  />
                  {/* moneda original pegada al precio: 2251.29 sin "Bs" parece un error */}
                  {currency !== 'USD' && (
                    <span className="font-mono text-[10px] text-muted-foreground">{currencySymbol(currency)}</span>
                  )}
                  {needsReview(it) && (
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-[2px] text-amber-400">
                      {t('pantry.receipt.review')}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {UNITS.map(u => (
                    <button
                      key={u ?? 'none'}
                      type="button"
                      onClick={() => updateDraft(i, { unit: u })}
                      className={cn(
                        'shrink-0 rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase transition-colors',
                        it.unit === u
                          ? 'border-lime-400/60 bg-lime-400/15 text-lime-400'
                          : 'border-border text-muted-foreground hover:border-lime-400/30',
                      )}
                    >
                      {u ?? '—'}
                    </button>
                  ))}
                </div>
                {showRaw && (it as { raw_line?: string }).raw_line ? (
                  <div className="mt-1 truncate font-mono text-[9px] text-muted-foreground/70">
                    {(it as { raw_line?: string }).raw_line}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <>
              {matched.map(m => (
                <div key={m.match!.id} className="flex items-center justify-between border-b border-border py-3">
                  <span className="truncate text-sm font-medium text-foreground">{m.match!.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[2px] text-amber-400">
                    {result.intent === 'discard' ? t('pantry.willDiscard') : t('pantry.willDeplete')}
                  </span>
                </div>
              ))}
              {matches.filter(m => !m.match).map((m, i) => (
                <div key={`nm-${i}`} className="border-b border-border py-3">
                  <span className="text-sm text-muted-foreground">{t('pantry.noMatch', { name: m.parsed.name })}</span>
                </div>
              ))}
            </>
          )}
          {receipt && receipt.ignoredLines.length > 0 && (
            <div className="py-3">
              <button type="button" onClick={() => setShowIgnored(v => !v)}>
                <span className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
                  {receipt.ignoredLines.length === 1
                    ? t('pantry.receipt.ignoredOne')
                    : t('pantry.receipt.ignoredMany', { n: receipt.ignoredLines.length })}
                  {'  '}{showIgnored ? '▴' : '▾'}
                </span>
              </button>
              {showIgnored && receipt.ignoredLines.map((line, i) => (
                <div key={`ig-${i}`} className="mt-1 truncate font-mono text-[9px] text-muted-foreground/60">{line}</div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            className="flex-1 font-mono text-xs uppercase tracking-[2px]"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={confirm}
            disabled={!canConfirm || busy}
            className="flex-1 bg-lime-400 font-mono text-xs uppercase tracking-[2px] text-zinc-900 hover:bg-lime-300"
          >
            {busy ? <Spinner className="size-4" /> : t('pantry.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
