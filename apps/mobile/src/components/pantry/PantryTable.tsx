import { memo } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { groupPantryByCategory } from '@calistenia/core/lib/pantry'
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

const Row = memo(function Row({ item, onPress }: { item: PantryItem; onPress: (item: PantryItem) => void }) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      className="flex-row items-center gap-3 border-b border-border px-1 py-3 active:opacity-70"
    >
      <View className={`size-1.5 rounded-full ${CONFIDENCE_DOT[item.confidence] ?? 'bg-muted-foreground'}`} />
      <Text className="flex-1 font-sans-medium text-foreground" numberOfLines={1}>{item.name}</Text>
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

export function PantryTable({ items, onPressItem, onEmptyCta }: {
  items: PantryItem[]
  onPressItem: (item: PantryItem) => void
  onEmptyCta: () => void
}) {
  const { t } = useTranslation()
  const sections = groupPantryByCategory(items)
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
      renderItem={({ item }) => <Row item={item} onPress={onPressItem} />}
      ListEmptyComponent={
        <View className="items-center px-6 py-16">
          <Text className="font-bebas text-2xl text-foreground">{t('pantry.emptyTitle')}</Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">{t('pantry.emptyBody')}</Text>
          <Pressable onPress={onEmptyCta} className="mt-4 border border-lime/40 px-4 py-2 active:bg-lime/10">
            <Text className="font-mono text-xs uppercase tracking-[2px] text-lime">{t('pantry.emptyCta')}</Text>
          </Pressable>
        </View>
      }
    />
  )
}
