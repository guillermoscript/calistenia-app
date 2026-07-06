import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { PantryItem } from '@calistenia/core/types'
import type { DepleteRow } from './use-pantry-depletion'

function parseNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

interface RowState { checked: boolean; qty: string }

export function PantryDepleteSheet({ rows, onConfirm, onDismiss }: {
  rows: DepleteRow[] | null
  onConfirm: (selected: { item: PantryItem; qtyConsumed: number }[]) => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<RowState[]>([])
  const [invalid, setInvalid] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (rows) {
      setState(rows.map((r) => ({ checked: r.checked, qty: r.qtyConsumed == null ? '' : String(r.qtyConsumed) })))
      setInvalid(new Set())
    }
  }, [rows])

  if (!rows || rows.length === 0 || state.length !== rows.length) return null

  const toggle = (i: number) =>
    setState((s) => s.map((r, j) => (j === i ? { ...r, checked: !r.checked } : r)))
  const setQty = (i: number, v: string) =>
    setState((s) => s.map((r, j) => (j === i ? { ...r, qty: v } : r)))

  const handleConfirm = () => {
    // Filas marcadas sin qty válida: NUNCA descartar en silencio — resaltar y esperar input.
    const bad = new Set<number>()
    const selected = rows.flatMap((r, i) => {
      if (!state[i].checked) return []
      const qty = parseNum(state[i].qty)
      if (qty == null || qty <= 0) { bad.add(i); return [] }
      return [{ item: r.item, qtyConsumed: qty }]
    })
    if (bad.size > 0) { setInvalid(bad); return }
    if (selected.length > 0) onConfirm(selected)
    else onDismiss() // nada marcado = omitir
  }

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onDismiss}>
      <KeyboardProvider>
        <View style={{ flex: 1 }}>
          <Pressable onPress={onDismiss} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
            <View
              className="border-t border-border bg-card"
              style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 14, maxHeight: '75%' }}
            >
              <View className="items-center pb-2 pt-3"><View className="h-1 w-9 rounded-full bg-lime/40" /></View>
              <View className="flex-row items-center justify-between px-4 pb-1">
                <View>
                  <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                    {t('pantry.deplete.kicker')}
                  </Text>
                  <Text className="font-bebas text-2xl text-foreground">{t('pantry.deplete.title')}</Text>
                </View>
                <Pressable onPress={onDismiss} hitSlop={8} className="p-2">
                  <X size={18} color="hsl(0 0% 55%)" />
                </Pressable>
              </View>
              <Text className="px-4 pb-3 font-sans text-xs text-muted-foreground">{t('pantry.deplete.subtitle')}</Text>
              <ScrollView keyboardShouldPersistTaps="handled">
                {rows.map((r, i) => (
                  <View key={r.item.id} className="flex-row items-center gap-3 border-t border-border px-4 py-3">
                    <Pressable
                      onPress={() => toggle(i)}
                      hitSlop={8}
                      className={`h-6 w-6 items-center justify-center border ${state[i].checked ? 'border-lime bg-lime' : 'border-border'}`}
                    >
                      {state[i].checked && <Check size={14} color="black" strokeWidth={3} />}
                    </Pressable>
                    <View className="flex-1">
                      <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>{r.item.name}</Text>
                      <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground" numberOfLines={1}>
                        {r.matchedFood}{r.confidence === 'low' ? ' · ?' : ''}
                      </Text>
                    </View>
                    <TextInput
                      value={state[i].qty}
                      onChangeText={(v) => { setQty(i, v); if (invalid.has(i)) setInvalid(new Set([...invalid].filter((j) => j !== i))) }}
                      keyboardType="numeric"
                      placeholder="—"
                      placeholderTextColor="hsl(0 0% 45%)"
                      className={`h-10 w-20 rounded-md border bg-background px-2 text-right font-mono text-sm text-foreground ${invalid.has(i) ? 'border-destructive' : 'border-input'}`}
                    />
                    <Text className="w-12 font-mono text-[10px] text-muted-foreground">{r.item.unit ?? ''}</Text>
                  </View>
                ))}
              </ScrollView>
              <View className="flex-row gap-2 border-t border-border px-4 pt-3">
                <Pressable onPress={onDismiss} className="h-11 flex-1 items-center justify-center border border-border active:bg-muted/20">
                  <Text className="font-mono text-xs uppercase tracking-[2px] text-muted-foreground">{t('pantry.deplete.skip')}</Text>
                </Pressable>
                <Pressable onPress={handleConfirm} className="h-11 flex-1 items-center justify-center bg-lime active:bg-lime/80">
                  <Text className="font-mono text-xs uppercase tracking-[2px] text-black">{t('pantry.deplete.confirm')}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </KeyboardProvider>
    </Modal>
  )
}
