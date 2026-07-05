import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { PANTRY_CATEGORY_ORDER, normalizePantryName } from '@calistenia/core/lib/pantry'
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

export function PantryConfirmSheet({ visible, result, matches, onConfirmAdd, onConfirmConsume, onClose }: {
  visible: boolean
  result: PantryParseResult | null
  matches: ConsumeMatch[]
  onConfirmAdd: (items: PantryParsedItem[]) => void
  onConfirmConsume: (items: PantryItem[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<PantryParsedItem[]>([])

  useEffect(() => {
    if (result?.intent === 'add') setDraft(result.items)
  }, [result])

  if (!result) return null
  const isAdd = result.intent === 'add'
  const matched = matches.filter(m => m.match != null)
  const canConfirm = isAdd ? (draft.length > 0 && draft.every(d => d.name.trim().length > 0)) : matched.length > 0

  const updateDraft = (idx: number, patch: Partial<PantryParsedItem>) => {
    setDraft(d => d.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const removeDraft = (idx: number) => setDraft(d => d.filter((_, i) => i !== idx))

  const confirm = () => {
    if (isAdd) onConfirmAdd(draft)
    else onConfirmConsume(matched.map(m => m.match!))
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <View
            className="border-t border-border bg-card"
            style={{ maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 14 }}
          >
            <View className="items-center pb-2 pt-3"><View className="h-1 w-9 rounded-full bg-lime/40" /></View>
            <View className="flex-row items-center justify-between px-4 pb-2">
              <View>
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                  {t('pantry.title')}
                </Text>
                <Text className="font-bebas text-2xl text-foreground">
                  {isAdd ? t('pantry.confirmAddTitle') : t('pantry.confirmConsumeTitle')}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8} className="p-2">
                <X size={18} color="hsl(0 0% 55%)" />
              </Pressable>
            </View>
            <ScrollView className="px-4" keyboardShouldPersistTaps="handled">
              {isAdd ? (
                draft.map((it, i) => (
                  <View key={`${it.name_normalized}-${i}`} className="border-b border-border py-3">
                    <View className="flex-row items-center justify-between">
                      <TextInput
                        value={it.name}
                        onChangeText={v => updateDraft(i, { name: v, name_normalized: normalizePantryName(v) })}
                        placeholder={t('pantry.namePlaceholder')}
                        placeholderTextColor="hsl(0 0% 45%)"
                        className="flex-1 p-0 font-sans-medium text-foreground"
                      />
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={() => updateDraft(i, { category: PANTRY_CATEGORY_ORDER[(PANTRY_CATEGORY_ORDER.indexOf(it.category) + 1) % PANTRY_CATEGORY_ORDER.length] })}
                          hitSlop={6}
                        >
                          <Text className="font-mono text-[10px] uppercase text-muted-foreground">
                            {t(`pantry.categories.${it.category}`)}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => removeDraft(i)} hitSlop={8} className="p-1">
                          <X size={14} color="hsl(0 0% 55%)" />
                        </Pressable>
                      </View>
                    </View>
                    <View className="mt-2 flex-row items-center gap-2">
                      <TextInput
                        value={it.quantity == null ? '' : String(it.quantity)}
                        onChangeText={v => updateDraft(i, { quantity: parseNum(v) })}
                        keyboardType="numeric"
                        placeholder="—"
                        placeholderTextColor="hsl(0 0% 45%)"
                        className="h-9 w-16 rounded-md border border-input bg-background px-2 text-center font-mono text-xs text-foreground"
                      />
                      <Pressable
                        onPress={() => updateDraft(i, { unit: UNITS[(UNITS.indexOf(it.unit) + 1) % UNITS.length] })}
                        className="h-9 min-w-16 items-center justify-center rounded-md border border-border px-2 active:bg-lime/10"
                      >
                        <Text className="font-mono text-xs text-muted-foreground">{it.unit ?? '—'}</Text>
                      </Pressable>
                      <TextInput
                        value={it.price_total == null ? '' : String(it.price_total)}
                        onChangeText={v => updateDraft(i, { price_total: parseNum(v) })}
                        keyboardType="numeric"
                        placeholder="$"
                        placeholderTextColor="hsl(0 0% 45%)"
                        className="h-9 w-20 rounded-md border border-input bg-background px-2 text-center font-mono text-xs text-foreground"
                      />
                    </View>
                  </View>
                ))
              ) : (
                <>
                  {matched.map(m => (
                    <View key={m.match!.id} className="flex-row items-center justify-between border-b border-border py-3">
                      <Text className="font-sans-medium text-foreground" numberOfLines={1}>{m.match!.name}</Text>
                      <Text className="font-mono text-[10px] uppercase tracking-[2px] text-amber-400">
                        {result.intent === 'discard' ? t('pantry.willDiscard') : t('pantry.willDeplete')}
                      </Text>
                    </View>
                  ))}
                  {matches.filter(m => !m.match).map((m, i) => (
                    <View key={`nm-${i}`} className="border-b border-border py-3">
                      <Text className="text-sm text-muted-foreground">
                        {t('pantry.noMatch', { name: m.parsed.name })}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
            <View className="flex-row gap-2 px-4 pt-3">
              <Pressable
                onPress={onClose}
                className="h-11 flex-1 items-center justify-center border border-border active:bg-muted/20"
              >
                <Text className="font-mono text-xs uppercase tracking-[2px] text-muted-foreground">
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={confirm}
                disabled={!canConfirm}
                className={`h-11 flex-1 items-center justify-center ${canConfirm ? 'bg-lime active:bg-lime/80' : 'bg-muted/40'}`}
              >
                <Text className="font-mono text-xs uppercase tracking-[2px] text-black">{t('pantry.confirm')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}
