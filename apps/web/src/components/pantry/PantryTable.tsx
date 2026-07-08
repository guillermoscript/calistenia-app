import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { daysUntil, groupPantryByCategory } from '@calistenia/core/lib/pantry'
import { formatMoney, roundQty } from '@calistenia/core/lib/shopping'
import { todayStr } from '@calistenia/core/lib/dateUtils'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { cn } from '../../lib/utils'
import type { PantryItem } from '@calistenia/core/types'

const CONFIDENCE_DOT: Record<string, string> = {
  high: 'bg-lime-400',
  med: 'bg-amber-400',
  low: 'bg-muted-foreground',
}

function fmtQty(item: PantryItem): string {
  if (item.quantity == null) return '—'
  const approx = item.confidence !== 'high' ? '~' : ''
  // roundQty: qty puede venir de merges de compra (sumas float) — sin colas IEEE
  return `${approx}${roundQty(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`
}

function expiryLabel(item: PantryItem, today: string, expiredText: string): { text: string; cls: string } | null {
  const d = daysUntil(item.expiryEstimate, today)
  if (d == null) return null
  if (d < 0) return { text: expiredText, cls: 'text-red-400' }
  if (d <= 3) return { text: `${d}D`, cls: 'text-amber-400' }
  if (d <= 14) return { text: `${d}D`, cls: 'text-muted-foreground' }
  return null
}

function Row({ item, today, expiredText, deleteLabel, selecting, selected, onPress, onToggleSelect, onRequestDelete }: {
  item: PantryItem
  today: string
  expiredText: string
  deleteLabel: string
  selecting: boolean
  selected: boolean
  onPress: (item: PantryItem) => void
  onToggleSelect: (id: string) => void
  onRequestDelete: (item: PantryItem) => void
}) {
  const expiry = expiryLabel(item, today, expiredText)
  const activate = () => (selecting ? onToggleSelect(item.id) : onPress(item))
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
      }}
      className={cn(
        'flex items-center gap-3 border-b border-border px-1 py-3 cursor-pointer transition-colors hover:bg-muted/10',
        selected && 'bg-lime-400/10',
      )}
    >
      {selecting && (
        <div
          className={cn(
            'size-5 shrink-0 flex items-center justify-center rounded border-2',
            selected ? 'border-lime-400 bg-lime-400' : 'border-muted-foreground/50',
          )}
        >
          {selected && (
            <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="black" strokeWidth={3}>
              <path d="M3 8l3.5 3.5L13 5" />
            </svg>
          )}
        </div>
      )}
      <div className={cn('size-1.5 shrink-0 rounded-full', CONFIDENCE_DOT[item.confidence] ?? 'bg-muted-foreground')} />
      <span className="flex-1 truncate text-sm font-medium text-foreground">{item.name}</span>
      {expiry && <span className={cn('font-mono text-[10px]', expiry.cls)}>{expiry.text}</span>}
      <span className="font-mono text-xs text-muted-foreground">{fmtQty(item)}</span>
      {item.priceTotal != null && (
        <span className="font-mono text-xs text-lime-400">${formatMoney(item.priceTotal)}</span>
      )}
      {!selecting && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRequestDelete(item) }}
          aria-label={deleteLabel}
          className="-my-2 p-2 text-muted-foreground/60 hover:text-foreground"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function PantryTable({ items, onPressItem, onExample, onDeleteItem, selectionMode, selectedIds, onToggleSelect }: {
  items: PantryItem[]
  onPressItem: (item: PantryItem) => void
  onExample: (text: string) => void
  onDeleteItem: (item: PantryItem) => void
  selectionMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const today = todayStr()
  const expiredText = t('pantry.expired')
  const deleteLabel = t('pantry.delete')
  const [pendingDelete, setPendingDelete] = useState<PantryItem | null>(null)
  const sections = groupPantryByCategory(items)
  const examples = [t('pantry.example1'), t('pantry.example2')]

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14">
        <div className="font-bebas text-2xl text-foreground">{t('pantry.emptyTitle')}</div>
        <div className="mt-1 text-center text-sm text-muted-foreground">{t('pantry.emptyBody')}</div>
        <div className="mb-2 mt-6 self-start font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('pantry.tryExamples')}
        </div>
        {examples.map(ex => (
          <button
            key={ex}
            type="button"
            onClick={() => onExample(ex)}
            className="mb-2 w-full border border-border px-4 py-3 text-left transition-colors hover:border-lime-400/40 hover:bg-lime-400/10"
          >
            <span className="font-mono text-xs text-foreground">&quot;{ex}&quot;</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div>
      {sections.map(section => (
        <div key={section.category}>
          <div className="mb-1 mt-4 flex items-center gap-2 px-1">
            <div className="size-1.5 bg-lime-400" />
            <span className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t(`pantry.categories.${section.category}`)}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {section.data.map(item => (
            <Row
              key={item.id}
              item={item}
              today={today}
              expiredText={expiredText}
              deleteLabel={deleteLabel}
              selecting={selectionMode}
              selected={selectedIds.has(item.id)}
              onPress={onPressItem}
              onToggleSelect={onToggleSelect}
              onRequestDelete={setPendingDelete}
            />
          ))}
        </div>
      ))}
      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={open => { if (!open) setPendingDelete(null) }}
        title={t('pantry.deleteTitle')}
        description={pendingDelete?.name ?? ''}
        confirmLabel={t('pantry.delete')}
        variant="destructive"
        onConfirm={() => { if (pendingDelete) onDeleteItem(pendingDelete) }}
      />
    </div>
  )
}
