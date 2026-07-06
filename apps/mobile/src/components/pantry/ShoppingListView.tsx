import { useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, TextInput, View } from 'react-native'
import { KeyboardAvoidingView, KeyboardStickyView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Check, Minus, Plus, X } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import {
  useActiveShoppingList,
  useAddShoppingItem,
  useGenerateShoppingList,
  useRemoveShoppingItem,
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
  const router = useRouter()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { data: list } = useActiveShoppingList(userId)
  const { data: lastDone = null } = useLastPurchaseDate(userId)
  const { cadence, setCadence } = useShoppingCadence(userId)
  const { activePlan, planDays } = useWeeklyMealPlan(userId)
  const generate = useGenerateShoppingList(userId)
  const toggle = useToggleShoppingItem(userId)
  const complete = useCompletePurchase(userId)
  const addItem = useAddShoppingItem(userId)
  const removeItem = useRemoveShoppingItem(userId)
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({})
  const [draftName, setDraftName] = useState('')

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
      { onSuccess: () => setPriceDrafts({}) }, // drafts viejos no aplican a la lista nueva
    )

  const onGenerate = () => {
    // Regenerar descarta checks y precios ya cargados — confirmar si hay progreso
    if (list?.items.some((i) => i.checked)) {
      Alert.alert(t('shopping.regenConfirmTitle'), t('shopping.regenConfirmMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), style: 'destructive', onPress: doGenerate },
      ])
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

  const onDone = () => {
    if (!list) return
    const count = list.items.filter((i) => i.checked).length
    Alert.alert(t('shopping.doneConfirmTitle'), t('shopping.doneConfirmMsg', { count }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () =>
          complete.mutate(list, {
            onSuccess: (n) => {
              Alert.alert('', t('shopping.doneSuccess', { count: n }))
              router.replace('/pantry')
            },
          }),
      },
    ])
  }

  const totals = list ? shoppingTotals(list.items) : { est: 0, actual: 0 }
  const checkedCount = list?.items.filter((i) => i.checked).length ?? 0

  return (
    <KeyboardAvoidingView className="flex-1" behavior="padding">
      <View className="flex-1 px-4">
        {/* ── PRÓXIMA COMPRA · en N días · M items + cadencia ── */}
        <View className="border-b border-border py-3">
          <View className="flex-row items-baseline justify-between">
            <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {t('shopping.nextPurchase')}
            </Text>
            <Text className="font-bebas text-2xl text-lime">
              {next.daysLeft === 0 ? t('shopping.today') : t('shopping.inDays', { count: next.daysLeft })}
              {list ? ` · ${t('shopping.itemCount', { count: list.items.length })}` : ''}
            </Text>
          </View>
          <View className="mt-2 flex-row items-center gap-3">
            <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
              {t('shopping.cadenceLabel')}
            </Text>
            <Pressable
              onPress={() => setCadence(Math.max(1, cadence - 1))}
              hitSlop={10}
              className="h-7 w-7 items-center justify-center rounded border border-border active:bg-lime/10"
            >
              <Minus size={12} color="hsl(0 0% 55%)" />
            </Pressable>
            <Text className="font-bebas text-lg text-foreground">{cadence}</Text>
            <Pressable
              onPress={() => setCadence(Math.min(90, cadence + 1))}
              hitSlop={10}
              className="h-7 w-7 items-center justify-center rounded border border-border active:bg-lime/10"
            >
              <Plus size={12} color="hsl(0 0% 55%)" />
            </Pressable>
            <Text className="font-mono text-[10px] text-muted-foreground">{t('shopping.daysSuffix')}</Text>
            {list && (
              <View className="ml-auto">
                <Button size="sm" variant="lime" onPress={onGenerate} disabled={generate.isPending}>
                  <Text>{t('shopping.regenerate')}</Text>
                </Button>
              </View>
            )}
          </View>
        </View>

        {/* ── Errores visibles (lección F2: nada de fallos silenciosos) ── */}
        {(generate.isError || complete.isError || toggle.isError) && (
          <View className="border-b border-red-500/40 bg-red-500/10 px-3 py-2">
            <Text className="font-mono text-[10px] uppercase tracking-[2px] text-red-500">
              {t('shopping.error')}
            </Text>
          </View>
        )}

        {/* ── First run: CTA primario con contexto ── */}
        {!list && (
          <View className="py-10 px-2">
            <Text className="text-center font-sans text-sm text-muted-foreground">
              {t('shopping.firstRun')}
            </Text>
            <Button className="mt-5" variant="limeSolid" onPress={onGenerate} disabled={generate.isPending}>
              <Text>{t('shopping.generate')}</Text>
            </Button>
          </View>
        )}

        {/* ── Lista ── */}
        {list && list.items.length === 0 && (
          <Text className="py-8 text-center font-sans text-sm text-muted-foreground">{t('shopping.empty')}</Text>
        )}
        {/* flex-1 wrapper: la lista se ENCOGE cuando el teclado mete padding
            (patrón pantry.tsx) — sin esto el add-bar queda tapado */}
        <FlatList
          className="flex-1"
          data={list?.items ?? []}
          keyExtractor={(_, i) => String(i)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: it, index }) => (
            <Pressable
              onPress={() => onToggle(index, it)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: it.checked }}
              className="border-b border-border py-3 active:opacity-70"
            >
              <View className="flex-row items-center gap-3">
                {/* checkbox visual — el toggle es la FILA entera (target grande) */}
                <View
                  className={`h-6 w-6 items-center justify-center rounded border-2 ${it.checked ? 'border-lime bg-lime' : 'border-muted-foreground/50'}`}
                >
                  {it.checked && <Check size={15} color="black" strokeWidth={3} />}
                </View>
                <Text
                  className={`flex-1 font-sans-medium ${it.checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                  numberOfLines={1}
                >
                  {it.name}
                </Text>
                {it.reasons.map((r) => (
                  <Text key={r} className={`rounded border px-1 py-0.5 font-mono text-[9px] uppercase ${REASON_CLS[r]}`}>
                    {t(`shopping.reason.${r}`)}
                  </Text>
                ))}
                <Text className="font-mono text-xs text-muted-foreground">{formatQty(it.qty, it.unit)}</Text>
                {it.checked ? (
                  <TextInput
                    keyboardType="numeric"
                    placeholder={it.est_price != null ? formatMoney(it.est_price) : t('shopping.pricePlaceholder')}
                    placeholderTextColor="hsl(0 0% 40%)"
                    value={priceDrafts[index] ?? (it.actual_price != null ? String(it.actual_price) : '')}
                    onChangeText={(s) => setPriceDrafts((d) => ({ ...d, [index]: s }))}
                    onEndEditing={() => onPriceCommit(index)}
                    className="h-8 w-16 rounded-md border border-input bg-background px-2 text-center font-mono text-xs text-foreground"
                  />
                ) : (
                  it.est_price != null && (
                    // muted, no lime: precio estimado es dato, no interacción
                    <Text className="font-mono text-xs text-muted-foreground">~${formatMoney(it.est_price)}</Text>
                  )
                )}
                <Pressable
                  onPress={() => onRemove(index)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                  className="pl-1"
                >
                  <X size={14} color="hsl(0 0% 40%)" />
                </Pressable>
              </View>
              {it.incompatible_have && (
                <Text className="mt-1 pl-8 font-mono text-[10px] text-amber-500">
                  {t('shopping.incompatibleNote', {
                    have: formatQty(it.incompatible_have.qty, it.incompatible_have.unit),
                    need: formatQty(it.qty, it.unit),
                  })}
                </Text>
              )}
            </Pressable>
          )}
        />

        {/* ── Alta manual: sticky sobre el teclado (KAV no alcanzaba en MIUI) ── */}
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View className="flex-row items-center gap-2 border-t border-border bg-background py-2">
            <TextInput
              placeholder={t('shopping.addPlaceholder')}
              placeholderTextColor="hsl(0 0% 40%)"
              value={draftName}
              onChangeText={setDraftName}
              onSubmitEditing={onAdd}
              returnKeyType="done"
              className="h-10 flex-1 rounded-md border border-input bg-background px-3 font-sans text-sm text-foreground"
            />
            <Pressable
              onPress={onAdd}
              disabled={!draftName.trim() || addItem.isPending}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('shopping.addPlaceholder')}
              className={`h-10 w-10 items-center justify-center rounded-md border ${draftName.trim() ? 'border-lime/40 active:bg-lime/10' : 'border-border'}`}
            >
              <Plus size={18} color={draftName.trim() ? 'hsl(74 90% 45%)' : 'hsl(0 0% 40%)'} />
            </Pressable>
          </View>
        </KeyboardStickyView>

        {/* ── Footer: totales + Compra hecha ── */}
        {list && list.items.length > 0 && (
          <View className="border-t border-border py-3">
            <View className="flex-row justify-between">
              <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('shopping.totalEst')} <Text className="font-bebas text-lg text-foreground">{totals.est > 0 ? `~$${formatMoney(totals.est)}` : '—'}</Text>
              </Text>
              <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('shopping.totalReal')} <Text className="font-bebas text-lg text-lime">${formatMoney(totals.actual)}</Text>
              </Text>
            </View>
            <Button className="mt-3" variant="limeSolid" onPress={onDone} disabled={checkedCount === 0 || complete.isPending}>
              <Text>{t('shopping.done')}</Text>
            </Button>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}
