import { useEffect, useState } from 'react'
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { PantryItem } from '@calistenia/core/types'

function parseNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function PantryEditSheet({ item, onSave, onDelete, onClose }: {
  item: PantryItem | null
  onSave: (item: PantryItem, newQuantity: number | null, newPriceTotal: number | null) => void
  onDelete: (item: PantryItem) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')

  useEffect(() => {
    if (item) {
      setQty(item.quantity == null ? '' : String(item.quantity))
      setPrice(item.priceTotal == null ? '' : String(item.priceTotal))
    }
  }, [item])

  if (!item) return null

  const confirmDelete = () => {
    Alert.alert(t('pantry.deleteTitle'), item.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('pantry.delete'), style: 'destructive', onPress: () => onDelete(item) },
    ])
  }

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <View
            className="border-t border-border bg-card"
            style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 14 }}
          >
            <View className="items-center pb-2 pt-3"><View className="h-1 w-9 rounded-full bg-lime/40" /></View>
            <View className="flex-row items-center justify-between px-4 pb-3">
              <View>
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                  {t('pantry.editTitle')}
                </Text>
                <Text className="font-bebas text-2xl text-foreground" numberOfLines={1}>{item.name}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8} className="p-2">
                <X size={18} color="hsl(0 0% 55%)" />
              </Pressable>
            </View>
            <View className="flex-row gap-3 px-4">
              <View className="flex-1">
                <Text className="mb-1 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                  {t('pantry.quantity')}{item.unit ? ` (${item.unit})` : ''}
                </Text>
                <TextInput
                  value={qty}
                  onChangeText={setQty}
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor="hsl(0 0% 45%)"
                  className="h-11 rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground"
                />
              </View>
              <View className="flex-1">
                <Text className="mb-1 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                  {t('pantry.price')}
                </Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor="hsl(0 0% 45%)"
                  className="h-11 rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground"
                />
              </View>
            </View>
            <View className="flex-row gap-2 px-4 pt-4">
              <Pressable
                onPress={confirmDelete}
                className="h-11 flex-1 items-center justify-center border border-border active:bg-muted/20"
              >
                <Text className="font-mono text-xs uppercase tracking-[2px] text-muted-foreground">
                  {t('pantry.delete')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onSave(item, parseNum(qty), parseNum(price))}
                className="h-11 flex-1 items-center justify-center bg-lime active:bg-lime/80"
              >
                <Text className="font-mono text-xs uppercase tracking-[2px] text-black">{t('pantry.save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}
