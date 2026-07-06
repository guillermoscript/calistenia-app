import { useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, TextInput, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Check, Minus, Plus } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import {
  useActiveShoppingList,
  useGenerateShoppingList,
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
  const { data: list } = useActiveShoppingList(userId)
  const { data: lastDone = null } = useLastPurchaseDate(userId)
  const { cadence, setCadence } = useShoppingCadence(userId)
  const { activePlan, planDays } = useWeeklyMealPlan(userId)
  const generate = useGenerateShoppingList(userId)
  const toggle = useToggleShoppingItem(userId)
  const complete = useCompletePurchase(userId)
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({})

  const today = todayStr()
  const next = nextPurchaseInfo(lastDone, cadence, today)
  const planIngredients = useMemo(
    () => planDays.flatMap((d) => d.meals ?? []).flatMap((m) => m.recipe?.ingredients ?? []),
    [planDays],
  )

  const onGenerate = () =>
    generate.mutate({
      planIngredients,
      linkedPlan: activePlan?.id ?? null,
      horizonDays: next.daysLeft > 0 ? next.daysLeft : cadence,
      lastPurchaseDate: lastDone,
    })

  const onToggle = (index: number, it: ShoppingListItem) => {
    if (!list) return
    toggle.mutate({ list, index, checked: !it.checked })
  }

  const onPriceCommit = (index: number) => {
    if (!list) return
    const price = parseNum(priceDrafts[index] ?? '')
    toggle.mutate({ list, index, checked: true, actualPrice: price })
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
            <View className="ml-auto">
              <Button size="sm" variant="lime" onPress={onGenerate} disabled={generate.isPending}>
                <Text>{list ? t('shopping.regenerate') : t('shopping.generate')}</Text>
              </Button>
            </View>
          </View>
        </View>

        {/* ── Lista ── */}
        {list && list.items.length === 0 && (
          <Text className="py-8 text-center font-sans text-sm text-muted-foreground">{t('shopping.empty')}</Text>
        )}
        <FlatList
          data={list?.items ?? []}
          keyExtractor={(_, i) => String(i)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: it, index }) => (
            <View className="border-b border-border py-3">
              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => onToggle(index, it)}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: it.checked }}
                  className={`size-5 items-center justify-center rounded border ${it.checked ? 'border-lime bg-lime' : 'border-border'}`}
                >
                  {it.checked && <Check size={14} color="black" strokeWidth={3} />}
                </Pressable>
                <Text
                  className={`flex-1 font-sans-medium ${it.checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                  numberOfLines={1}
                >
                  {it.name}
                </Text>
                {it.reasons.map((r) => (
                  <Text key={r} className={`rounded border px-1 py-0.5 font-mono text-[8px] uppercase ${REASON_CLS[r]}`}>
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
                    <Text className="font-mono text-xs text-lime">~${formatMoney(it.est_price)}</Text>
                  )
                )}
              </View>
              {it.incompatible_have && (
                <Text className="mt-1 pl-8 font-mono text-[10px] text-amber-500">
                  {t('shopping.incompatibleNote', {
                    have: formatQty(it.incompatible_have.qty, it.incompatible_have.unit),
                    need: formatQty(it.qty, it.unit),
                  })}
                </Text>
              )}
            </View>
          )}
        />

        {/* ── Footer: totales + Compra hecha ── */}
        {list && list.items.length > 0 && (
          <View className="border-t border-border py-3">
            <View className="flex-row justify-between">
              <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                {t('shopping.totalEst')} <Text className="font-bebas text-lg text-foreground">~${formatMoney(totals.est)}</Text>
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
