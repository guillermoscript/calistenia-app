import { memo, useCallback, useMemo } from 'react'
import { Alert, Pressable, SectionList, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react-native'
import { daysUntil, groupPantryByCategory } from '@calistenia/core/lib/pantry'
import { formatMoney, roundQty } from '@calistenia/core/lib/shopping'
import { todayStr } from '@calistenia/core/lib/dateUtils'
import type { PantryItem } from '@calistenia/core/types'

const CONFIDENCE_DOT: Record<string, string> = {
  high: 'bg-lime',
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

const Row = memo(function Row({ item, today, expiredText, selecting, selected, onPress, onToggleSelect, onDelete }: {
  item: PantryItem
  today: string
  expiredText: string
  selecting: boolean
  selected: boolean
  onPress: (item: PantryItem) => void
  onToggleSelect: (item: PantryItem) => void
  onDelete?: (item: PantryItem) => void
}) {
  const expiry = expiryLabel(item, today, expiredText)
  return (
    <Pressable
      onPress={() => (selecting ? onToggleSelect(item) : onPress(item))}
      onLongPress={() => onToggleSelect(item)}
      accessibilityState={selecting ? { selected } : undefined}
      className={`flex-row items-center gap-3 border-b border-border px-1 py-3 active:opacity-70 ${selected ? 'bg-lime/10' : ''}`}
    >
      {selecting ? (
        <View className={`h-5 w-5 items-center justify-center rounded border-2 ${selected ? 'border-lime bg-lime' : 'border-muted-foreground/50'}`}>
          {selected ? <Check size={13} color="black" strokeWidth={3} /> : null}
        </View>
      ) : null}
      <View className={`size-1.5 rounded-full ${CONFIDENCE_DOT[item.confidence] ?? 'bg-muted-foreground'}`} />
      <Text className="flex-1 font-sans-medium text-foreground" numberOfLines={1}>{item.name}</Text>
      {expiry && <Text className={`font-mono text-[10px] ${expiry.cls}`}>{expiry.text}</Text>}
      <Text className="font-mono text-xs text-muted-foreground">{fmtQty(item)}</Text>
      {item.priceTotal != null && (
        <Text className="font-mono text-xs text-lime">${formatMoney(item.priceTotal)}</Text>
      )}
      {onDelete && !selecting ? (
        <Pressable
          onPress={() => onDelete(item)}
          hitSlop={6}
          accessibilityRole="button"
          className="-my-2 p-2"
        >
          <X size={16} color="hsl(0 0% 40%)" />
        </Pressable>
      ) : null}
    </Pressable>
  )
})

function SectionHeader({ label }: { label: string }) {
  return (
    <View className="mb-1 mt-4 flex-row items-center gap-2 px-1">
      <View className="size-1.5 bg-lime" />
      <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{label}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  )
}

export function PantryTable({ items, onPressItem, onExample, onDeleteItem, selectedIds, onToggleSelect }: {
  items: PantryItem[]
  onPressItem: (item: PantryItem) => void
  onExample: (text: string) => void
  onDeleteItem?: (item: PantryItem) => void
  selectedIds: ReadonlySet<string>
  onToggleSelect: (item: PantryItem) => void
}) {
  const { t } = useTranslation()
  const today = todayStr()
  const expiredText = t('pantry.expired')
  // Estas tres se reconstruían en cada render y anulaban el `memo` de <Row/>:
  // basta con que una prop cambie de identidad para que la fila re-renderice.
  const confirmDelete = useMemo(
    () =>
      onDeleteItem
        ? (item: PantryItem) => {
            Alert.alert(t('pantry.deleteTitle'), item.name, [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.delete'), style: 'destructive', onPress: () => onDeleteItem(item) },
            ])
          }
        : undefined,
    [onDeleteItem, t],
  )
  const sections = useMemo(() => groupPantryByCategory(items), [items])
  const examples = useMemo(() => [t('pantry.example1'), t('pantry.example2')], [t])
  const selecting = selectedIds.size > 0

  const renderSectionHeader = useCallback(
    ({ section }: { section: { category: string } }) => (
      <SectionHeader label={t(`pantry.categories.${section.category}`)} />
    ),
    [t],
  )

  const renderItem = useCallback(
    ({ item }: { item: PantryItem }) => (
      <Row
        item={item}
        today={today}
        expiredText={expiredText}
        selecting={selecting}
        selected={selectedIds.has(item.id)}
        onPress={onPressItem}
        onToggleSelect={onToggleSelect}
        onDelete={confirmDelete}
      />
    ),
    [today, expiredText, selecting, selectedIds, onPressItem, onToggleSelect, confirmDelete],
  )
  return (
    <SectionList
      sections={sections}
      keyExtractor={it => it.id}
      contentContainerClassName="px-4 pb-4"
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      extraData={selectedIds}
      ListEmptyComponent={
        <View className="items-center px-6 py-14">
          <Text className="font-bebas text-2xl text-foreground">{t('pantry.emptyTitle')}</Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">{t('pantry.emptyBody')}</Text>
          <Text className="mb-2 mt-6 self-start font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('pantry.tryExamples')}
          </Text>
          {examples.map(ex => (
            <Pressable
              key={ex}
              onPress={() => onExample(ex)}
              className="mb-2 w-full border border-border px-4 py-3 active:border-lime/40 active:bg-lime/10"
            >
              <Text className="font-mono text-xs text-foreground">&quot;{ex}&quot;</Text>
            </Pressable>
          ))}
        </View>
      }
    />
  )
}
