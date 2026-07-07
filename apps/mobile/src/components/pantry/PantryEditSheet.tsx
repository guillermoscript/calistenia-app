import { useEffect, useRef, useState } from 'react'
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { currencySymbol } from '@calistenia/core/lib/money'
import type { PantryItem } from '@calistenia/core/types'

function parseNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function PantryEditSheet({ item, onSave, onDelete, onClose, onVerify, onGone }: {
  item: PantryItem | null
  onSave: (item: PantryItem, newQuantity: number | null, newPriceTotal: number | null) => void
  onDelete: (item: PantryItem) => void
  onClose: () => void
  onVerify: (item: PantryItem) => void
  onGone: (item: PantryItem) => void
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const qtyRef = useRef<TextInput>(null)

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
      {/* KeyboardProvider dentro del Modal: es otra ventana nativa (patrón CommentsSheet) */}
      <KeyboardProvider>
        <View style={{ flex: 1 }}>
          <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
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
                  ref={qtyRef}
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
                  {t('pantry.price')} $
                </Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor="hsl(0 0% 45%)"
                  className="h-11 rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground"
                />
                {/* multimoneda: lo que dice la factura, tasa del día de la compra */}
                {item.priceOriginal != null && item.currencyOriginal && item.currencyOriginal !== 'USD' && (
                  <Text className="mt-1 font-mono text-[9px] tracking-wide text-muted-foreground/70" numberOfLines={1}>
                    {currencySymbol(item.currencyOriginal)} {item.priceOriginal}
                    {item.exchangeRate != null ? ` @ ${item.exchangeRate}` : ''}
                  </Text>
                )}
              </View>
            </View>
            {item.confidence === 'low' && (
              <View className="mx-4 mt-4 border border-border">
                <Text className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                  {t('pantry.stillHave.question')}
                </Text>
                <View className="flex-row">
                  <Pressable
                    onPress={() => onVerify(item)}
                    className="h-11 flex-1 items-center justify-center border-r border-border active:bg-lime/10"
                  >
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-lime">{t('pantry.stillHave.same')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => qtyRef.current?.focus()}
                    className="h-11 flex-1 items-center justify-center border-r border-border active:bg-muted/20"
                  >
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-foreground">{t('pantry.stillHave.less')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onGone(item)}
                    className="h-11 flex-1 items-center justify-center active:bg-muted/20"
                  >
                    <Text className="font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground">{t('pantry.stillHave.gone')}</Text>
                  </Pressable>
                </View>
              </View>
            )}
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
          </KeyboardAvoidingView>
        </View>
      </KeyboardProvider>
    </Modal>
  )
}
