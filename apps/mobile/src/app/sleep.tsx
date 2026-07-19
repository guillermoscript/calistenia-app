/**
 * Sleep — screen nativa de registro/historial de sueño (issue #244, F1).
 * Puerto de apps/web/src/pages/SleepPage.tsx: resumen de "anoche" (o de la
 * fecha recibida por param, p. ej. desde el chip del calendario), stats de
 * 7 días y el historial completo. La creación/edición vive en
 * SleepLoggerSheet (Modal nativo) — este screen es dueño de useSleep y le
 * pasa saveSleepEntry/updateSleepEntry como props, así ambos comparten la
 * misma instancia de datos.
 *
 * Solapamiento con Health Connect: `openFor(date)` SIEMPRE busca primero si
 * ya hay un registro para esa fecha (manual o sincronizado del reloj) y, si
 * existe, abre el sheet en modo edición — nunca se llama a saveSleepEntry
 * para una fecha que ya tiene entrada (índice único user+date en
 * sleep_entries). Ver useSleep.ts: saveSleepEntry siempre hace `.create()`,
 * no upsert — el guard vive aquí.
 */
import { useMemo, useState } from 'react'
import { View, ScrollView, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Moon, Plus, Trash2 } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useSleep } from '@calistenia/core/hooks/useSleep'
import { daysAgoStr } from '@calistenia/core/lib/dateUtils'
import type { SleepEntry } from '@calistenia/core/types'
import SleepLoggerSheet from '@/components/sleep/SleepLoggerSheet'

const MUTED = 'rgba(255,255,255,0.45)'
const INDIGO = '#818cf8'

const QUALITY_LABEL_KEYS = ['', 'sleep.quality.1', 'sleep.quality.2', 'sleep.quality.3', 'sleep.quality.4', 'sleep.quality.5']

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function qualityColor(q: number): string {
  if (q <= 2) return '#ef4444'
  if (q === 3) return '#fbbf24'
  if (q === 4) return '#a3e635'
  return '#10b981'
}

/** "mar 15 jul" — sin Intl (no confiable en Hermes/Android), mismas claves i18n que el calendario. */
function useDateLabel() {
  const { t } = useTranslation()
  return (dateStr: string) => {
    const d = new Date(`${dateStr}T12:00:00`)
    const dayIdx = (d.getDay() + 6) % 7 // dayShort.* van Lunes=0..Domingo=6
    const dayShort = t(`dayShort.${dayIdx}`)
    const month = t(`month.${d.getMonth()}`).slice(0, 3)
    return `${dayShort} ${d.getDate()} ${month}`
  }
}

// ── Fila de historial ────────────────────────────────────────────────────────
function SleepEntryRow({ entry, label, onEdit, onDelete }: {
  entry: SleepEntry
  label: string
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <Pressable
      onPress={onEdit}
      className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3 active:border-indigo-400/30"
    >
      <View
        className="size-10 shrink-0 items-center justify-center rounded-lg border"
        style={{ borderColor: `${qualityColor(entry.quality)}4D`, backgroundColor: `${qualityColor(entry.quality)}1A` }}
      >
        <Text className="font-bebas text-lg" style={{ color: qualityColor(entry.quality) }}>{entry.quality}</Text>
      </View>
      <View className="flex-1">
        <Text className="font-sans-medium capitalize text-foreground">{label}</Text>
        <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {entry.bedtime} - {entry.wake_time} · {formatDuration(entry.duration_minutes)}
          {entry.awake_minutes ? ` (${formatDuration(entry.awake_minutes)} ${t('sleep.awakeFor').toLowerCase()})` : ''}
        </Text>
      </View>
      <Pressable
        onPress={(e) => { e.stopPropagation(); onDelete() }}
        className="size-8 items-center justify-center rounded-md active:bg-destructive/10"
        accessibilityRole="button"
        accessibilityLabel={t('common.delete')}
      >
        <Trash2 size={15} color="rgba(255,255,255,0.35)" />
      </Pressable>
    </Pressable>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View className="flex-1 items-center rounded-lg border border-border bg-card py-3">
      <Text className="font-bebas text-xl leading-none" style={color ? { color } : undefined}>{value}</Text>
      <Text className="mt-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground text-center px-1" numberOfLines={1}>{label}</Text>
    </View>
  )
}

export default function SleepScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = (user?.id as string) ?? null
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>()
  const dateLabel = useDateLabel()

  const { entries, isReady, weeklyStats, saveSleepEntry, updateSleepEntry, deleteSleepEntry } = useSleep(userId)

  const lastNightDate = useMemo(() => daysAgoStr(1), [])
  const targetDate = dateParam || lastNightDate
  const isLastNight = targetDate === lastNightDate
  const targetEntry = useMemo(() => entries.find((e) => e.date === targetDate) || null, [entries, targetDate])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDate, setSheetDate] = useState(targetDate)
  const [sheetEntry, setSheetEntry] = useState<SleepEntry | null>(null)

  // Único punto de apertura del sheet: siempre re-busca la entrada existente
  // para `date` antes de abrir, así nunca se dispara un create duplicado.
  const openFor = (date: string) => {
    haptics.selection()
    const existing = entries.find((e) => e.date === date) || null
    setSheetDate(date)
    setSheetEntry(existing)
    setSheetOpen(true)
  }

  const handleDelete = (entry: SleepEntry) => {
    haptics.selection()
    Alert.alert(
      t('sleep.deleteEntry'),
      t('sleep.deleteConfirm', { date: dateLabel(entry.date) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => { haptics.medium(); deleteSleepEntry(entry.id) },
        },
      ],
    )
  }

  const stats = useMemo(() => {
    const items: { label: string; value: string; color?: string }[] = []
    if (weeklyStats.entryCount === 0) return items
    items.push({ label: t('sleep.avgDuration'), value: formatDuration(Math.round(weeklyStats.avgDuration)), color: INDIGO })
    items.push({ label: t('sleep.avgQuality'), value: `${weeklyStats.avgQuality.toFixed(1)} / 5`, color: weeklyStats.avgQuality >= 3 ? '#10b981' : '#fbbf24' })
    items.push({ label: t('sleep.avgAwakenings'), value: weeklyStats.avgAwakenings.toFixed(1), color: weeklyStats.avgAwakenings <= 1 ? '#10b981' : '#fbbf24' })
    items.push({ label: t('sleep.scheduleRegularity'), value: `±${Math.round(weeklyStats.scheduleRegularity)}m`, color: weeklyStats.scheduleRegularity <= 30 ? '#10b981' : '#fbbf24' })
    if (weeklyStats.avgAwakeMinutes > 0) {
      items.push({ label: t('sleep.avgAwakeTime'), value: `${Math.round(weeklyStats.avgAwakeMinutes)}m`, color: weeklyStats.avgAwakeMinutes <= 15 ? '#10b981' : '#fbbf24' })
    }
    return items
  }, [weeklyStats, t])

  const statRows = useMemo(() => {
    const rows: { label: string; value: string; color?: string }[][] = []
    for (let i = 0; i < stats.length; i += 2) rows.push(stats.slice(i, i + 2))
    return rows
  }, [stats])

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 pb-10" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="mb-6 pb-2 pt-2">
          <Pressable
            onPress={() => { haptics.selection(); router.back() }}
            className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
          >
            <ChevronLeft size={24} color={MUTED} />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Moon size={26} color={INDIGO} />
            <Text className="font-bebas text-4xl text-foreground">{t('sleep.title')}</Text>
          </View>
          <Text className="mt-1 font-sans text-sm text-muted-foreground">{t('sleep.subtitle')}</Text>
        </View>

        {!isReady ? (
          <Text className="py-8 text-center text-sm text-muted-foreground">{t('sleep.loadingData')}</Text>
        ) : (
          <View className="gap-6">
            {/* ── Resumen / CTA ── */}
            {targetEntry ? (
              <Pressable onPress={() => openFor(targetDate)}>
                <Card
                  className={cn(
                    'border-l-[3px]',
                    targetEntry.quality >= 4 ? 'border-l-emerald-500' : targetEntry.quality === 3 ? 'border-l-amber-400' : 'border-l-red-500',
                  )}
                >
                  <CardContent className="gap-1 py-5">
                    <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                      {isLastNight ? t('sleep.lastNight') : dateLabel(targetDate)}
                    </Text>
                    <View className="flex-row items-center justify-between gap-4">
                      <View>
                        <Text className="font-bebas text-2xl leading-none text-foreground">{formatDuration(targetEntry.duration_minutes)}</Text>
                        <Text className="mt-1 text-sm text-muted-foreground">
                          {targetEntry.bedtime} - {targetEntry.wake_time}
                          {targetEntry.awake_minutes ? ` · ${formatDuration(targetEntry.awake_minutes)} ${t('sleep.awakeFor').toLowerCase()}` : ''}
                          {targetEntry.awakenings > 0 ? ` · ${targetEntry.awakenings} ${t('sleep.awakenings')}` : ''}
                        </Text>
                      </View>
                      <Text className="font-mono text-xs" style={{ color: qualityColor(targetEntry.quality) }}>
                        {t(QUALITY_LABEL_KEYS[targetEntry.quality])}
                      </Text>
                    </View>
                  </CardContent>
                </Card>
              </Pressable>
            ) : (
              <Pressable onPress={() => openFor(targetDate)}>
                <View className="flex-row items-center gap-4 rounded-xl border-2 border-dashed border-indigo-400/30 bg-indigo-400/5 p-5 active:bg-indigo-400/10">
                  <View className="size-12 shrink-0 items-center justify-center rounded-full bg-indigo-400/10">
                    <Moon size={22} color={INDIGO} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-bebas text-xl leading-none text-indigo-400">{t('sleep.register')}</Text>
                    <Text className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {isLastNight ? t('sleep.howSleptLastNight') : dateLabel(targetDate)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}

            {/* ── Stats 7 días ── */}
            {stats.length > 0 && (
              <View className="gap-2">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('sleep.stats7days')}</Text>
                <View className="gap-2">
                  {statRows.map((row, i) => (
                    <View key={i} className="flex-row gap-2">
                      {row.map((s) => <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />)}
                      {row.length === 1 && <View className="flex-1" />}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── Historial ── */}
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('sleep.historyLabel')}</Text>
                <Button size="sm" className="h-8 bg-indigo-500 px-3 active:bg-indigo-400" onPress={() => openFor(targetDate)}>
                  <Plus size={13} color="white" />
                  <Text className="font-bebas text-xs tracking-wide text-white">{t('sleep.addEntry')}</Text>
                </Button>
              </View>

              {entries.length === 0 ? (
                <Card>
                  <CardContent className="items-center gap-1 py-8">
                    <Text className="text-3xl">😴</Text>
                    <Text className="text-sm text-muted-foreground">{t('sleep.noEntries')}</Text>
                    <Text className="text-center text-xs text-muted-foreground">{t('sleep.startTracking')}</Text>
                  </CardContent>
                </Card>
              ) : (
                <View className="gap-2">
                  {entries.map((entry) => (
                    <SleepEntryRow
                      key={entry.id}
                      entry={entry}
                      label={dateLabel(entry.date)}
                      onEdit={() => openFor(entry.date)}
                      onDelete={() => handleDelete(entry)}
                    />
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <SleepLoggerSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        date={sheetDate}
        entry={sheetEntry}
        saveSleepEntry={saveSleepEntry}
        updateSleepEntry={updateSleepEntry}
      />
    </SafeAreaView>
  )
}
