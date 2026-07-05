import { memo } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { daysUntil, groupPantryByCategory } from '@calistenia/core/lib/pantry'
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
  return `${approx}${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
}

function expiryLabel(item: PantryItem, today: string, expiredText: string): { text: string; cls: string } | null {
  const d = daysUntil(item.expiryEstimate, today)
  if (d == null) return null
  if (d < 0) return { text: expiredText, cls: 'text-red-400' }
  if (d <= 3) return { text: `${d}D`, cls: 'text-amber-400' }
  if (d <= 14) return { text: `${d}D`, cls: 'text-muted-foreground' }
  return null
}

const Row = memo(function Row({ item, today, expiredText, onPress }: {
  item: PantryItem
  today: string
  expiredText: string
  onPress: (item: PantryItem) => void
}) {
  const expiry = expiryLabel(item, today, expiredText)
  return (
    <Pressable
      onPress={() => onPress(item)}
      className="flex-row items-center gap-3 border-b border-border px-1 py-3 active:opacity-70"
    >
      <View className={`size-1.5 rounded-full ${CONFIDENCE_DOT[item.confidence] ?? 'bg-muted-foreground'}`} />
      <Text className="flex-1 font-sans-medium text-foreground" numberOfLines={1}>{item.name}</Text>
      {expiry && <Text className={`font-mono text-[10px] ${expiry.cls}`}>{expiry.text}</Text>}
      <Text className="font-mono text-xs text-muted-foreground">{fmtQty(item)}</Text>
      {item.priceTotal != null && (
        <Text className="font-mono text-xs text-lime">${item.priceTotal}</Text>
      )}
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

export function PantryTable({ items, onPressItem, onExample }: {
  items: PantryItem[]
  onPressItem: (item: PantryItem) => void
  onExample: (text: string) => void
}) {
  const { t } = useTranslation()
  const today = todayStr()
  const expiredText = t('pantry.expired')
  const sections = groupPantryByCategory(items)
  const examples = [t('pantry.example1'), t('pantry.example2')]
  return (
    <SectionList
      sections={sections}
      keyExtractor={it => it.id}
      contentContainerClassName="px-4 pb-4"
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <SectionHeader label={t(`pantry.categories.${section.category}`)} />
      )}
      renderItem={({ item }) => (
        <Row item={item} today={today} expiredText={expiredText} onPress={onPressItem} />
      )}
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
