import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Minus, Plus, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { cn } from '../../lib/utils'
import {
  useActiveShoppingList,
  useAddShoppingItem,
  useGenerateShoppingList,
  useRemoveShoppingItem,
  useRemoveShoppingItems,
  useToggleShoppingItem,
  useCompletePurchase,
  useLastPurchaseDate,
  useShoppingCadence,
} from '@calistenia/core/hooks/useShoppingList'
import { useWeeklyMealPlan } from '@calistenia/core/hooks/useWeeklyMealPlan'
import {
  formatMoney,
  formatQty,
  nextPurchaseInfo,
  shoppingTotals,
} from '@calistenia/core/lib/shopping'
import { todayStr } from '@calistenia/core/lib/dateUtils'
import type { ShoppingListItem, ShoppingReason } from '@calistenia/core/types'

const REASON_CLS: Record<ShoppingReason, string> = {
  plan: 'border-border text-muted-foreground',
  se_acabo: 'border-amber-500/40 text-amber-500',
  vence: 'border-red-500/40 text-red-500',
}

function parseNum(s: string): number | null {
  if (s.trim() === '') return null // blur sin escribir ≠ precio $0
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function ShoppingListView({ userId }: { userId: string | null }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data: list } = useActiveShoppingList(userId)
  const { data: lastDone = null } = useLastPurchaseDate(userId)
  const { cadence, setCadence } = useShoppingCadence(userId)
  const { activePlan, planDays } = useWeeklyMealPlan(userId)
  const generate = useGenerateShoppingList(userId)
  const toggle = useToggleShoppingItem(userId)
  const complete = useCompletePurchase(userId)
  const addItem = useAddShoppingItem(userId)
  const removeItem = useRemoveShoppingItem(userId)
  const removeItems = useRemoveShoppingItems(userId)
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({})
  const [draftName, setDraftName] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [doneConfirmOpen, setDoneConfirmOpen] = useState(false)

  const today = todayStr()
  const next = nextPurchaseInfo(lastDone, cadence, today)
  const planIngredients = useMemo(
    () => planDays.flatMap((d) => d.meals ?? []).flatMap((m) => m.recipe?.ingredients ?? []),
    [planDays],
  )

  const doGenerate = () =>
    generate.mutate(
      {
        planIngredients,
        linkedPlan: activePlan?.id ?? null,
        horizonDays: next.daysLeft > 0 ? next.daysLeft : cadence,
        lastPurchaseDate: lastDone,
      },
      {
        onSuccess: () => {
          setPriceDrafts({}) // drafts viejos no aplican a la lista nueva
          setSelected(new Set()) // índices de la lista vieja tampoco
          setSelectMode(false)
        },
      },
    )

  const onGenerate = () => {
    // Regenerar descarta checks y precios ya cargados — confirmar si hay progreso
    if (list?.items.some((i) => i.checked)) {
      setRegenConfirmOpen(true)
      return
    }
    doGenerate()
  }

  const onToggle = (index: number, it: ShoppingListItem) => {
    if (!list) return
    toggle.mutate({ listId: list.id, index, checked: !it.checked })
  }

  const onPriceCommit = (index: number) => {
    if (!list) return
    const price = parseNum(priceDrafts[index] ?? '')
    toggle.mutate({ listId: list.id, index, checked: true, actualPrice: price })
  }

  const onAdd = () => {
    if (!draftName.trim()) return
    addItem.mutate({ name: draftName }, { onSuccess: () => setDraftName('') })
  }

  const onRemove = (index: number) => {
    if (!list) return
    setPriceDrafts({}) // los drafts van por índice; al borrar se corren
    removeItem.mutate({ listId: list.id, index })
  }

  const toggleSelect = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const onBulkRemove = () => {
    if (!list) return
    const indices = [...selected]
    setSelected(new Set())
    setSelectMode(false)
    setPriceDrafts({}) // los drafts van por índice; al borrar se corren
    removeItems.mutate({ listId: list.id, indices })
  }

  const onDone = () => {
    if (!list) return
    complete.mutate(list, {
      onSuccess: (n) => {
        toast.success(t('shopping.doneSuccess', { count: n }))
        navigate('/pantry')
      },
    })
  }

  const totals = list ? shoppingTotals(list.items) : { est: 0, actual: 0 }
  const checkedCount = list?.items.filter((i) => i.checked).length ?? 0
  const hasError =
    generate.isError || complete.isError || toggle.isError || addItem.isError || removeItem.isError || removeItems.isError

  return (
    <div>
      {/* ── PRÓXIMA COMPRA · en N días · M items + cadencia ── */}
      <div className="border-b border-border py-3">
        <div className="flex items-baseline justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {t('shopping.nextPurchase')}
          </div>
          <div className="font-bebas text-2xl text-lime">
            {next.daysLeft === 0 ? t('shopping.today') : t('shopping.inDays', { count: next.daysLeft })}
            {list ? ` · ${t('shopping.itemCount', { count: list.items.length })}` : ''}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {t('shopping.cadenceLabel')}
          </div>
          <button
            onClick={() => setCadence(Math.max(1, cadence - 1))}
            disabled={cadence <= 1}
            className={cn(
              'h-7 w-7 flex items-center justify-center rounded border transition-colors',
              cadence <= 1 ? 'border-border/50 opacity-40' : 'border-border hover:bg-lime/10',
            )}
          >
            <Minus size={12} className="text-muted-foreground" />
          </button>
          <div className="font-bebas text-lg text-foreground">{cadence}</div>
          <button
            onClick={() => setCadence(Math.min(90, cadence + 1))}
            disabled={cadence >= 90}
            className={cn(
              'h-7 w-7 flex items-center justify-center rounded border transition-colors',
              cadence >= 90 ? 'border-border/50 opacity-40' : 'border-border hover:bg-lime/10',
            )}
          >
            <Plus size={12} className="text-muted-foreground" />
          </button>
          <div className="font-mono text-[10px] text-muted-foreground">{t('shopping.daysSuffix')}</div>
          {list && (
            <div className="ml-auto flex items-center gap-3">
              {list.items.length > 0 && (
                <button
                  onClick={() => {
                    setSelectMode((v) => !v)
                    setSelected(new Set())
                  }}
                  className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {/* sin long-press en web: toggle explícito para el modo selección (idiom común.edit, como PantryPage) */}
                  {selectMode ? t('common.cancel') : t('common.edit')}
                </button>
              )}
              <Button size="sm" variant="outline" onClick={onGenerate} disabled={generate.isPending}
                className="border-lime/40 text-lime hover:bg-lime/10 font-bebas text-sm tracking-wide">
                {t('shopping.regenerate')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Errores visibles (lección F2: nada de fallos silenciosos) ── */}
      {hasError && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[2px] text-red-500">{t('shopping.error')}</div>
        </div>
      )}

      {/* ── First run: CTA primario con contexto ── */}
      {!list && (
        <div className="px-2 py-10 text-center">
          <p className="font-sans text-sm text-muted-foreground">{t('shopping.firstRun')}</p>
          <Button
            className="mt-5 bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-sm tracking-wide"
            onClick={onGenerate}
            disabled={generate.isPending}
          >
            {t('shopping.generate')}
          </Button>
        </div>
      )}

      {/* ── Lista ── */}
      {list && list.items.length === 0 && (
        <p className="py-8 text-center font-sans text-sm text-muted-foreground">{t('shopping.empty')}</p>
      )}
      <div>
        {(list?.items ?? []).map((it, index) => (
          <div
            key={index}
            onClick={() => (selectMode ? toggleSelect(index) : onToggle(index, it))}
            role="checkbox"
            aria-checked={selectMode ? selected.has(index) : it.checked}
            className={cn(
              'border-b border-border py-3 cursor-pointer transition-colors hover:bg-card/50',
              selected.has(index) && 'bg-lime/10',
            )}
          >
            <div className="flex items-center gap-3">
              {/* checkbox visual — el toggle es la FILA entera (target grande) */}
              <div
                className={cn(
                  'h-6 w-6 flex items-center justify-center rounded border-2 shrink-0',
                  (selectMode ? selected.has(index) : it.checked) ? 'border-lime bg-lime' : 'border-muted-foreground/50',
                )}
              >
                {(selectMode ? selected.has(index) : it.checked) && <Check size={15} className="text-black" strokeWidth={3} />}
              </div>
              <div
                className={cn(
                  'flex-1 truncate font-medium',
                  it.checked ? 'text-muted-foreground line-through' : 'text-foreground',
                )}
              >
                {it.name}
              </div>
              {/* silencio = plan (default); solo se etiqueta lo excepcional */}
              {it.reasons.filter((r) => r !== 'plan').map((r) => (
                <span key={r} className={cn('rounded border px-1 py-0.5 font-mono text-[9px] uppercase', REASON_CLS[r])}>
                  {t(`shopping.reason.${r}`)}
                </span>
              ))}
              <div className="font-mono text-xs text-muted-foreground shrink-0">{formatQty(it.qty, it.unit)}</div>
              {it.checked ? (
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={it.est_price != null ? formatMoney(it.est_price) : t('shopping.pricePlaceholder')}
                  value={priceDrafts[index] ?? (it.actual_price != null ? String(it.actual_price) : '')}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setPriceDrafts((d) => ({ ...d, [index]: e.target.value }))}
                  onBlur={() => onPriceCommit(index)}
                  onKeyDown={(e) => e.key === 'Enter' && onPriceCommit(index)}
                  className="h-8 w-16 shrink-0 px-2 text-center font-mono text-xs"
                />
              ) : (
                it.est_price != null && (
                  // muted, no lime: precio estimado es dato, no interacción
                  <div className="font-mono text-xs text-muted-foreground shrink-0">~${formatMoney(it.est_price)}</div>
                )
              )}
              {!selectMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(index)
                  }}
                  aria-label={t('common.delete')}
                  className="-my-2 -mr-1 ml-1 shrink-0 p-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {it.incompatible_have && (
              <div className="mt-1 pl-9 font-mono text-[10px] text-amber-500">
                {t('shopping.incompatibleNote', {
                  have: formatQty(it.incompatible_have.qty, it.incompatible_have.unit),
                  need: formatQty(it.qty, it.unit),
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Alta manual (o barra de selección si el modo está activo) ── */}
      {selectMode ? (
        <div className="flex items-center gap-2 border-t border-border bg-background py-2">
          <button
            onClick={() => {
              setSelectMode(false)
              setSelected(new Set())
            }}
            aria-label={t('common.cancel')}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex-1 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {/* plural manual: mismo patrón que el mobile */}
            {selected.size === 1 ? t('common.selectedOne') : t('common.selectedMany', { n: selected.size })}
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setBulkDeleteConfirmOpen(true)}
            disabled={selected.size === 0}
          >
            {t('common.delete')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-border bg-background py-2">
          <Input
            placeholder={t('shopping.addPlaceholder')}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            className="h-10 flex-1"
          />
          <button
            onClick={onAdd}
            disabled={!draftName.trim() || addItem.isPending}
            aria-label={t('shopping.addPlaceholder')}
            className={cn(
              'h-10 w-10 flex items-center justify-center rounded-md border transition-colors',
              draftName.trim() ? 'border-lime/40 hover:bg-lime/10 text-lime' : 'border-border text-muted-foreground',
            )}
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      {/* ── Footer: totales + Compra hecha ── */}
      {list && list.items.length > 0 && (
        <div className="border-t border-border py-3">
          <div className="flex justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {t('shopping.totalEst')}{' '}
              <span className="font-bebas text-lg text-foreground">
                {totals.est > 0 ? `~$${formatMoney(totals.est)}` : '—'}
              </span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {t('shopping.totalReal')}{' '}
              {checkedCount > 0 ? (
                // cero sin items marcados no es dato: — muted hasta que empiece la compra
                <span className="font-bebas text-lg text-lime">${formatMoney(totals.actual)}</span>
              ) : (
                <span className="font-bebas text-lg text-muted-foreground">—</span>
              )}
            </div>
          </div>
          <Button
            className="mt-3 w-full bg-lime text-lime-foreground hover:bg-lime/90 font-bebas text-sm tracking-wide"
            onClick={() => setDoneConfirmOpen(true)}
            disabled={checkedCount === 0 || complete.isPending}
          >
            {t('shopping.done')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={regenConfirmOpen}
        onOpenChange={setRegenConfirmOpen}
        title={t('shopping.regenConfirmTitle')}
        description={t('shopping.regenConfirmMsg')}
        onConfirm={doGenerate}
      />
      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        title={selected.size === 1 ? t('common.deleteOneTitle') : t('common.deleteManyTitle', { n: selected.size })}
        description=""
        variant="destructive"
        confirmLabel={t('common.delete')}
        onConfirm={onBulkRemove}
      />
      <ConfirmDialog
        open={doneConfirmOpen}
        onOpenChange={setDoneConfirmOpen}
        title={t('shopping.doneConfirmTitle')}
        description={t('shopping.doneConfirmMsg', { count: checkedCount })}
        onConfirm={onDone}
        loading={complete.isPending}
      />
    </div>
  )
}
