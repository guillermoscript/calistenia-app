import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useRouter } from 'expo-router'
import { ArrowLeft, ShoppingCart } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import {
  useAddPantryItems, useAdjustPantryItem, useDeletePantryItem, usePantryHistory, usePantryItems,
} from '@calistenia/core/hooks/usePantry'
import { parsePantry } from '@calistenia/core/lib/pantry-api'
import { daysUntil } from '@calistenia/core/lib/pantry'
import type { PantryItem, PantryParsedItem, PantryParseResult } from '@calistenia/core/types'
import { PantryTable } from '@/components/pantry/PantryTable'
import { PantryChatInput } from '@/components/pantry/PantryChatInput'
import { PantryConfirmSheet, type ConsumeMatch } from '@/components/pantry/PantryConfirmSheet'
import { PantryEditSheet } from '@/components/pantry/PantryEditSheet'
import { useAuthUser } from '@/lib/use-auth-user'
import { Sentry } from '@/lib/instrument'

export default function PantryScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const authUser = useAuthUser()
  const userId = authUser?.id ?? null

  const { data: items = [] } = usePantryItems(userId)
  const { data: history = [] } = usePantryHistory(userId)
  const addItems = useAddPantryItems(userId)
  const adjustItem = useAdjustPantryItem(userId)
  const deleteItem = useDeletePantryItem(userId)

  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<string | null>(null)
  const [parseResult, setParseResult] = useState<PantryParseResult | null>(null)
  const [editing, setEditing] = useState<PantryItem | null>(null)

  const matches: ConsumeMatch[] = useMemo(() => {
    if (!parseResult || parseResult.intent === 'add') return []
    return parseResult.items.map(parsed => ({
      parsed,
      match: items.find(it => it.nameNormalized === parsed.name_normalized) ?? null,
    }))
  }, [parseResult, items])

  const handleSend = async (text: string) => {
    setBusy(true)
    setReply(null)
    try {
      const result = await parsePantry(text, items.map(it => it.nameNormalized))
      setReply(result.reply)
      if (result.intent !== 'query' && result.intent !== 'unknown' && result.items.length > 0) {
        setParseResult(result)
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'parse' } })
      setReply(t('pantry.parseError'))
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmAdd = async (draft: PantryParsedItem[]) => {
    setParseResult(null)
    try {
      await addItems.mutateAsync(draft)
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'add_items' } })
      setReply(t('pantry.saveError'))
    }
  }

  const handleConfirmConsume = async (matchedItems: PantryItem[]) => {
    const type = parseResult?.intent === 'discard' ? 'discard' as const : 'consume' as const
    setParseResult(null)
    try {
      for (const it of matchedItems) {
        await adjustItem.mutateAsync({ item: it, type })
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'consume' } })
      setReply(t('pantry.saveError'))
    }
  }

  const handleEditSave = async (item: PantryItem, newQuantity: number | null, newPriceTotal: number | null) => {
    setEditing(null)
    try {
      await adjustItem.mutateAsync({ item, type: 'adjust', newQuantity, newPriceTotal })
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'edit' } })
      setReply(t('pantry.saveError'))
    }
  }

  const handleDelete = async (item: PantryItem) => {
    setEditing(null)
    try {
      await deleteItem.mutateAsync(item.id)
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'pantry', op: 'delete' } })
      setReply(t('pantry.saveError'))
    }
  }

  const openManualDraft = (draftItems: PantryParsedItem[]) => {
    setParseResult({ intent: 'add', items: draftItems, reply: '' })
  }

  const quickReAdd = (h: PantryItem) => {
    openManualDraft([{
      name: h.name,
      name_normalized: h.nameNormalized,
      category: h.category,
      quantity: h.quantity,
      unit: h.unit,
      price_total: null,
      expiry_days: daysUntil(h.expiryEstimate, h.purchaseDate ?? ''), // vida útil histórica como nueva estimación
      confidence: 'high',
    }])
  }

  const handleManualAdd = () => {
    openManualDraft([{
      name: '',
      name_normalized: '',
      category: 'otro',
      quantity: null,
      unit: null,
      price_total: null,
      expiry_days: null,
      confidence: 'high',
    }])
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2 py-1">
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-2" accessibilityRole="button">
          <ArrowLeft size={20} color="hsl(0 0% 55%)" />
        </Pressable>
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground">
            {t('pantry.kicker')}
          </Text>
          <Text className="font-bebas text-4xl text-foreground">{t('pantry.title')}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/shopping-list')}
          hitSlop={8}
          className="ml-auto p-2"
          accessibilityRole="button"
          accessibilityLabel={t('shopping.title')}
        >
          <ShoppingCart size={20} color="hsl(0 0% 55%)" />
        </Pressable>
      </View>

      {/* enabled=false con sheet abierto: el teclado del sheet no debe empujar el chat de fondo */}
      <KeyboardAvoidingView className="flex-1" behavior="padding" enabled={parseResult == null && editing == null}>
        <View className="flex-1">
          <PantryTable items={items} onPressItem={setEditing} onExample={handleSend} />
        </View>
        {reply && (
          <View className="mx-4 mb-2 self-start rounded-xl rounded-bl-none border border-border bg-card px-3 py-2">
            <Text className="text-sm text-foreground">{reply}</Text>
          </View>
        )}
        {history.length > 0 && (
          <View className="border-t border-border px-3 pt-2">
            <Text className="mb-1 font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
              {t('pantry.recentKicker')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View className="flex-row gap-2 pb-1">
                {history.map(h => (
                  <Pressable
                    key={h.nameNormalized}
                    onPress={() => quickReAdd(h)}
                    className="border border-border px-3 py-1.5 active:border-lime/40 active:bg-lime/10"
                  >
                    <Text className="font-mono text-xs text-foreground">{h.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
        <PantryChatInput onSend={handleSend} busy={busy} onManualAdd={handleManualAdd} />
      </KeyboardAvoidingView>

      <PantryConfirmSheet
        visible={parseResult != null}
        result={parseResult}
        matches={matches}
        onConfirmAdd={handleConfirmAdd}
        onConfirmConsume={handleConfirmConsume}
        onClose={() => setParseResult(null)}
      />
      <PantryEditSheet
        item={editing}
        onSave={handleEditSave}
        onDelete={handleDelete}
        onClose={() => setEditing(null)}
      />
    </SafeAreaView>
  )
}
