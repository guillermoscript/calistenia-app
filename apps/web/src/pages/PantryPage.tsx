import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ReceiptText, ChefHat, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import {
  useAddPantryItems, useAdjustPantryItem, useDeletePantryItem, useDeletePantryItems,
  usePantryHistory, usePantryItems,
} from '@calistenia/core/hooks/usePantry'
import { useUserCurrency } from '@calistenia/core/hooks/useUserCurrency'
import { canonCurrency } from '@calistenia/core/lib/money'
import { parsePantry } from '@calistenia/core/lib/pantry-api'
import { daysUntil } from '@calistenia/core/lib/pantry'
import type { PantryItem, PantryParsedItem, PantryParseResult, ReceiptParseResult } from '@calistenia/core/types'
import { PantryTable } from '../components/pantry/PantryTable'
import { PantryChatInput } from '../components/pantry/PantryChatInput'
import { PantryConfirmDialog, type ConsumeMatch } from '../components/pantry/PantryConfirmDialog'
import { PantryEditDialog } from '../components/pantry/PantryEditDialog'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { Button } from '../components/ui/button'
import { parseReceipt } from '../lib/receipt-api'
import { cn } from '../lib/utils'

export default function PantryPage({ userId }: { userId: string | null }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { data: items = [] } = usePantryItems(userId)
  const { data: history = [] } = usePantryHistory(userId)
  const addItems = useAddPantryItems(userId)
  const adjustItem = useAdjustPantryItem(userId)
  const deleteItem = useDeletePantryItem(userId)
  const deleteItems = useDeletePantryItems(userId)

  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<string | null>(null)
  const [parseResult, setParseResult] = useState<PantryParseResult | null>(null)
  const [editing, setEditing] = useState<PantryItem | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [receiptMeta, setReceiptMeta] = useState<
    { storeName: string | null; purchaseDate: string | null; currency: string | null; exchangeRate: number | null; ignoredLines: string[] } | null
  >(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Multimoneda (USD de referencia): moneda de los precios del dialog =
  // la del recibo si se leyó, si no la default del user. Prefill de tasa:
  // impresa en el recibo > última usada por el user.
  const { prefs: currencyPrefs, saveRate } = useUserCurrency(userId)
  const pricingCurrency = canonCurrency(receiptMeta?.currency) ?? currencyPrefs.defaultCurrency
  const pricing = {
    currency: pricingCurrency,
    prefillRate: receiptMeta?.exchangeRate ?? currencyPrefs.rates[pricingCurrency] ?? null,
  }

  const matches: ConsumeMatch[] = useMemo(() => {
    if (!parseResult || parseResult.intent === 'add') return []
    return parseResult.items.map(parsed => ({
      parsed,
      match: items.find(it => it.nameNormalized === parsed.name_normalized) ?? null,
    }))
  }, [parseResult, items])

  const handleSend = async (text: string) => {
    setBusy(true)
    setReply(null)
    // Un parse de chat invalida cualquier recibo pendiente: si quedara receiptMeta,
    // los items del chat se guardarían como source 'receipt' con fecha/moneda ajenas.
    setReceiptMeta(null)
    try {
      const result = await parsePantry(text, items.map(it => it.nameNormalized))
      setReply(result.reply)
      if (result.intent !== 'query' && result.intent !== 'unknown' && result.items.length > 0) {
        setParseResult(result)
      }
    } catch (e) {
      setReply(e instanceof Error && e.message ? e.message : t('pantry.parseError'))
    } finally {
      setBusy(false)
    }
  }

  const runReceiptParse = async (files: File[]) => {
    setBusy(true)
    setReply(t('pantry.receipt.analyzing'))
    try {
      const result: ReceiptParseResult = await parseReceipt(files)
      if (result.items.length === 0) {
        setReply(t('pantry.receipt.noItems'))
        return
      }
      setReceiptMeta({
        storeName: result.store_name,
        purchaseDate: result.purchase_date,
        currency: result.currency,
        exchangeRate: result.exchange_rate_usd,
        ignoredLines: result.ignored_lines,
      })
      setReply(null)
      // ReceiptParsedItem extiende PantryParsedItem: raw_line viaja dentro del draft
      setParseResult({ intent: 'add', items: result.items, reply: '' })
    } catch (e) {
      // mensaje REAL del servidor si existe (lección del bug analyze-meal en release)
      setReply(e instanceof Error && e.message ? e.message : t('pantry.receipt.error'))
    } finally {
      setBusy(false)
    }
  }

  const handleReceiptFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3)
    e.target.value = ''
    if (files.length > 0) runReceiptParse(files)
  }

  const handleConfirmAdd = async (draft: PantryParsedItem[], exchangeRate: number | null) => {
    const meta = receiptMeta
    const currency = pricingCurrency
    setParseResult(null)
    setReceiptMeta(null)
    try {
      await addItems.mutateAsync({
        items: draft,
        ...(meta ? { source: 'receipt' as const, purchaseDate: meta.purchaseDate } : {}),
        currency,
        exchangeRate,
      })
      // recordar la tasa para el próximo recibo/chat en esa moneda
      if (exchangeRate != null && currency !== 'USD') saveRate({ code: currency, rate: exchangeRate })
    } catch {
      toast.error(t('pantry.saveError'))
    }
  }

  const handleConfirmConsume = async () => {
    const type = parseResult?.intent === 'discard' ? 'discard' as const : 'consume' as const
    const matchedItems = matches.filter(m => m.match != null).map(m => m.match!)
    setParseResult(null)
    try {
      for (const it of matchedItems) {
        await adjustItem.mutateAsync({ item: it, type })
      }
    } catch {
      toast.error(t('pantry.saveError'))
    }
  }

  const handleEditSave = async (item: PantryItem, newQuantity: number | null, newPriceTotal: number | null) => {
    setEditing(null)
    try {
      await adjustItem.mutateAsync({ item, type: 'adjust', newQuantity, newPriceTotal })
    } catch {
      toast.error(t('pantry.saveError'))
    }
  }

  const handleVerifyStillHave = async (item: PantryItem) => {
    setEditing(null)
    try {
      // adjust delta 0 + forceEvent: resetea el decay (evento + bump de updated)
      await adjustItem.mutateAsync({ item, type: 'adjust', newQuantity: item.quantity, forceEvent: true })
    } catch {
      toast.error(t('pantry.saveError'))
    }
  }

  const handleGone = async (item: PantryItem) => {
    setEditing(null)
    try {
      await adjustItem.mutateAsync({ item, type: 'consume' })
    } catch {
      toast.error(t('pantry.saveError'))
    }
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleBulkDelete = async () => {
    const ids = [...selectedIds]
    setSelectedIds(new Set())
    setSelectionMode(false)
    try {
      await deleteItems.mutateAsync(ids)
    } catch {
      toast.error(t('pantry.saveError'))
    }
  }

  const handleDelete = async (item: PantryItem) => {
    setEditing(null)
    try {
      await deleteItem.mutateAsync(item.id)
    } catch {
      toast.error(t('pantry.saveError'))
    }
  }

  const openManualDraft = (draftItems: PantryParsedItem[]) => {
    setParseResult({ intent: 'add', items: draftItems, reply: '' })
  }

  const quickReAdd = (h: PantryItem) => {
    openManualDraft([{
      name: h.name,
      name_normalized: h.nameNormalized,
      category: h.category,
      quantity: h.quantity,
      unit: h.unit,
      price_total: null,
      expiry_days: daysUntil(h.expiryEstimate, h.purchaseDate ?? ''), // vida útil histórica como nueva estimación
      confidence: 'high',
    }])
  }

  const handleManualAdd = () => {
    openManualDraft([{
      name: '',
      name_normalized: '',
      category: 'otro',
      quantity: null,
      unit: null,
      price_total: null,
      expiry_days: null,
      confidence: 'high',
    }])
  }

  const toggleSelectionMode = () => {
    setSelectionMode(v => !v)
    setSelectedIds(new Set())
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="10,3 5,8 10,13" />
        </svg>
        {t('common.back')}
      </button>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t('pantry.kicker')}</div>
          <div className="font-bebas text-4xl md:text-5xl">{t('pantry.title')}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            aria-label={t('pantry.receipt.scan')}
            title={t('pantry.receipt.scan')}
            className="p-2 text-muted-foreground transition-colors hover:text-lime-400 disabled:opacity-50"
          >
            <ReceiptText size={20} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/pantry/recipes')}
            aria-label={t('savedRecipes.title')}
            title={t('savedRecipes.title')}
            className="p-2 text-muted-foreground transition-colors hover:text-lime-400"
          >
            <ChefHat size={20} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/pantry/shopping')}
            aria-label={t('shopping.title')}
            title={t('shopping.title')}
            className="p-2 text-muted-foreground transition-colors hover:text-lime-400"
          >
            <ShoppingCart size={20} />
          </button>
          {/* Sin i18n key dedicada para "modo selección" (regla: no inventar claves) —
              se reutiliza common.edit/common.cancel, idiom conocido (iOS Mail/Notes) para
              entrar/salir de selección múltiple. */}
          <Button
            size="sm"
            variant="outline"
            onClick={toggleSelectionMode}
            className={cn(
              'ml-1 font-mono text-[10px] uppercase tracking-[2px]',
              selectionMode && 'border-lime-400/60 bg-lime-400/15 text-lime-400',
            )}
          >
            {selectionMode ? t('common.cancel') : t('common.edit')}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleReceiptFiles}
          className="hidden"
        />
      </div>

      <div className="rounded-lg border border-border">
        <PantryTable
          items={items}
          onPressItem={setEditing}
          onExample={handleSend}
          onDeleteItem={handleDelete}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      </div>

      {reply && (
        <div className="mt-2 max-w-[85%] rounded-xl rounded-bl-none border border-border bg-card px-3 py-2">
          <p className="text-sm text-foreground">{reply}</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
            {t('pantry.recentKicker')}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {history.map(h => (
              <button
                key={h.nameNormalized}
                type="button"
                onClick={() => quickReAdd(h)}
                className="shrink-0 border border-border px-3 py-1.5 transition-colors hover:border-lime-400/40 hover:bg-lime-400/10"
              >
                <span className="font-mono text-xs text-foreground">{h.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        {selectionMode ? (
          <div className="flex items-center gap-3 border-t border-border py-3">
            <span className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {selectedIds.size === 1 ? t('common.selectedOne') : t('common.selectedMany', { n: selectedIds.size })}
            </span>
            <Button
              size="sm"
              variant="destructive"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkDeleteOpen(true)}
              className="ml-auto font-mono text-[10px] uppercase tracking-[2px]"
            >
              {t('common.delete')}
            </Button>
          </div>
        ) : (
          <PantryChatInput onSend={handleSend} busy={busy} onManualAdd={handleManualAdd} />
        )}
      </div>

      <PantryConfirmDialog
        open={parseResult != null}
        result={parseResult}
        matches={matches}
        onConfirmAdd={handleConfirmAdd}
        onConfirmConsume={handleConfirmConsume}
        onClose={() => { setParseResult(null); setReceiptMeta(null) }}
        busy={addItems.isPending || adjustItem.isPending}
        receipt={receiptMeta}
        pricing={pricing}
      />
      <PantryEditDialog
        item={editing}
        onSave={handleEditSave}
        onDelete={handleDelete}
        onClose={() => setEditing(null)}
        onVerify={handleVerifyStillHave}
        onGone={handleGone}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={selectedIds.size === 1 ? t('common.deleteOneTitle') : t('common.deleteManyTitle', { n: selectedIds.size })}
        description=""
        confirmLabel={t('common.delete')}
        variant="destructive"
        onConfirm={handleBulkDelete}
      />
    </div>
  )
}
