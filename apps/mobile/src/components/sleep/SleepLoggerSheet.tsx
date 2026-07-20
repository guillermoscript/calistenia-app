/**
 * SleepLoggerSheet — native Modal para registrar/editar una noche de sueño.
 * Puerto de apps/web/src/components/sleep/SleepForm.tsx: mismos campos
 * (bedtime, wake_time, awakenings, quality, awake_minutes, + detalle
 * expandible con cafeína/pantalla/estrés/nota). Reusa useSleep del core para
 * la escritura (saveSleepEntry/updateSleepEntry se reciben como props desde
 * el screen dueño del hook) — este componente NO toca PocketBase directamente.
 *
 * Shell de Modal nativo mirror de MealLoggerSheet (header + SafeAreaView +
 * KeyboardAvoidingView + ScrollView), NO gorhom (ver CLAUDE.md).
 */
import { useEffect, useState } from 'react'
import { Modal, View, ScrollView, Pressable, Platform, KeyboardAvoidingView, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { X, Star, ChevronDown, ChevronUp } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { op } from '@calistenia/core/lib/analytics'
import { calculateDurationMinutes, type SleepEntryInput } from '@calistenia/core/hooks/useSleep'
import type { SleepEntry } from '@calistenia/core/types'

const ACCENT = '#818cf8' // indigo-400 — mismo acento que el chip de sueño del calendario

const QUALITY_LABEL_KEYS = ['', 'sleep.qualityVeryBad', 'sleep.qualityBad', 'sleep.qualityFair', 'sleep.qualityGood', 'sleep.qualityExcellent']
const QUALITY_COLORS: Record<number, { text: string; border: string; bg: string }> = {
  1: { text: '#ef4444', border: 'border-red-500', bg: 'bg-red-500/10' },
  2: { text: '#fb923c', border: 'border-orange-400', bg: 'bg-orange-400/10' },
  3: { text: '#fbbf24', border: 'border-amber-400', bg: 'bg-amber-400/10' },
  4: { text: '#a3e635', border: 'border-lime', bg: 'bg-lime/10' },
  5: { text: '#10b981', border: 'border-emerald-500', bg: 'bg-emerald-500/10' },
}

const STRESS_LABEL_KEYS = ['', 'sleep.stressVeryLow', 'sleep.stressLow', 'sleep.stressMedium', 'sleep.stressHigh', 'sleep.stressVeryHigh']

const BED_PRESETS = ['21:30', '22:00', '22:30', '23:00', '23:30']
const WAKE_PRESETS = ['05:30', '06:00', '06:30', '07:00', '07:30']

function clamp2(val: string, max: number): string {
  const n = parseInt(val, 10)
  if (isNaN(n)) return '00'
  return String(Math.min(max, Math.max(0, n))).padStart(2, '0')
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// ── Hora HH:MM con presets rápidos (mismo idioma visual que reminders.tsx) ──
function TimeField({
  label, hour, minute, setHour, setMinute, presets,
}: {
  label: string
  hour: string
  minute: string
  setHour: (v: string) => void
  setMinute: (v: string) => void
  presets: string[]
}) {
  return (
    <View className="flex-1">
      <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Text>
      <View className="flex-row items-center justify-center gap-1 rounded-xl border border-border bg-muted/20 py-2.5">
        <TextInput
          value={hour}
          onChangeText={setHour}
          onBlur={() => setHour(clamp2(hour, 23))}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel={label}
          className="w-9 text-center font-bebas text-2xl text-foreground"
        />
        <Text className="font-bebas text-2xl text-muted-foreground" style={{ opacity: 0.4 }}>:</Text>
        <TextInput
          value={minute}
          onChangeText={setMinute}
          onBlur={() => setMinute(clamp2(minute, 59))}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel={label}
          className="w-9 text-center font-bebas text-2xl text-foreground"
        />
      </View>
      <View className="mt-1.5 flex-row gap-1">
        {presets.map((p) => {
          const active = `${hour}:${minute}` === p
          const [h, m] = p.split(':')
          return (
            <Pressable
              key={p}
              onPress={() => { haptics.selection(); setHour(h); setMinute(m) }}
              className={cn('flex-1 items-center rounded-lg py-1.5', active ? 'bg-indigo-400/15' : 'bg-muted/10')}
            >
              <Text className="font-mono text-[9px]" style={{ color: active ? ACCENT : 'rgba(255,255,255,0.35)' }}>
                {p}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// ── Stepper genérico (despertares / minutos despierto) ──────────────────────
function Stepper({
  value, onChange, step = 1, min = 0, max = 999, format,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  format?: (v: number) => string
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        onPress={() => { if (value > min) { haptics.selection(); onChange(Math.max(min, value - step)) } }}
        disabled={value <= min}
        className={cn('size-10 items-center justify-center rounded-lg border border-border active:bg-muted/40', value <= min && 'opacity-40')}
      >
        <Text className="text-lg text-foreground">-</Text>
      </Pressable>
      <Text className="w-14 text-center font-bebas text-2xl tabular-nums text-foreground">
        {format ? format(value) : value}
      </Text>
      <Pressable
        onPress={() => { haptics.selection(); onChange(Math.min(max, value + step)) }}
        className="size-10 items-center justify-center rounded-lg border border-border active:bg-muted/40"
      >
        <Text className="text-lg text-foreground">+</Text>
      </Pressable>
    </View>
  )
}

export interface SleepLoggerSheetProps {
  visible: boolean
  onClose: () => void
  /** Fecha (YYYY-MM-DD) de la noche que se está registrando. */
  date: string
  /** Entrada existente para `date` (manual o sincronizada del reloj) — si existe, se EDITA en vez de crear otra (índice único user+date). */
  entry: SleepEntry | null
  saveSleepEntry: (input: SleepEntryInput) => Promise<void>
  updateSleepEntry: (id: string, input: Partial<SleepEntryInput>) => Promise<void>
}

export default function SleepLoggerSheet({
  visible, onClose, date, entry, saveSleepEntry, updateSleepEntry,
}: SleepLoggerSheetProps) {
  const { t } = useTranslation()

  const [bedHour, setBedHour] = useState('23')
  const [bedMinute, setBedMinute] = useState('00')
  const [wakeHour, setWakeHour] = useState('07')
  const [wakeMinute, setWakeMinute] = useState('00')
  const [awakenings, setAwakenings] = useState(0)
  const [awakeMinutes, setAwakeMinutes] = useState(0)
  const [quality, setQuality] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [caffeine, setCaffeine] = useState(false)
  const [screenBed, setScreenBed] = useState(false)
  const [stressLevel, setStressLevel] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset del formulario cada vez que el sheet se abre — prefill desde `entry`
  // si ya hay un registro para esta fecha (manual o de Health Connect).
  useEffect(() => {
    if (!visible) return
    if (entry) {
      const [bh, bm] = (entry.bedtime || '23:00').split(':')
      const [wh, wm] = (entry.wake_time || '07:00').split(':')
      setBedHour(bh ?? '23')
      setBedMinute(bm ?? '00')
      setWakeHour(wh ?? '07')
      setWakeMinute(wm ?? '00')
      setAwakenings(entry.awakenings || 0)
      setAwakeMinutes(entry.awake_minutes || 0)
      setQuality(entry.quality || 0)
      const hasDetail = !!(entry.caffeine || entry.screen_before_bed || entry.stress_level || entry.note)
      setExpanded(hasDetail)
      setCaffeine(!!entry.caffeine)
      setScreenBed(!!entry.screen_before_bed)
      setStressLevel(entry.stress_level || 0)
      setNote(entry.note || '')
    } else {
      setBedHour('23'); setBedMinute('00')
      setWakeHour('07'); setWakeMinute('00')
      setAwakenings(0); setAwakeMinutes(0)
      setQuality(0)
      setExpanded(false); setCaffeine(false); setScreenBed(false)
      setStressLevel(0); setNote('')
    }
  }, [visible, entry, date])

  const bedtime = `${bedHour.padStart(2, '0')}:${bedMinute.padStart(2, '0')}`
  const wakeTime = `${wakeHour.padStart(2, '0')}:${wakeMinute.padStart(2, '0')}`
  const totalInBed = bedHour && wakeHour ? calculateDurationMinutes(bedtime, wakeTime) : 0
  const duration = Math.max(0, totalInBed - awakeMinutes)
  const isValid = quality >= 1 && quality <= 5

  const handleClose = () => { if (!saving) onClose() }

  const handleSubmit = async () => {
    if (!isValid || saving) return
    haptics.selection()
    const input: SleepEntryInput = {
      date,
      bedtime,
      wake_time: wakeTime,
      awakenings,
      quality,
      awake_minutes: awakeMinutes > 0 ? awakeMinutes : undefined,
    }
    if (expanded) {
      input.caffeine = caffeine
      input.screen_before_bed = screenBed
      if (stressLevel > 0) input.stress_level = stressLevel
      if (note.trim()) input.note = note.trim()
    }
    setSaving(true)
    try {
      if (entry) {
        // Ya existe registro para esta fecha (manual o health_connect) → actualizar,
        // NUNCA crear otro (índice único user+date en sleep_entries).
        await updateSleepEntry(entry.id, input)
      } else {
        await saveSleepEntry(input)
        op.track('sleep_logged', { quality })
      }
      haptics.success()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={handleClose}
    >
      <SafeAreaView className="flex-1 bg-background">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
          {/* ── Header ── */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/50">
            <View className="size-9" />
            <Text className="font-bebas text-xl tracking-widest text-foreground">
              {entry ? t('sleep.editEntry') : t('sleep.register')}
            </Text>
            <Pressable
              onPress={handleClose}
              className="size-9 items-center justify-center rounded-lg active:bg-muted"
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <X size={18} color="#a1a1aa" />
            </Pressable>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 py-4 gap-5"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Duración (preview) ── */}
            <View className="items-center py-2">
              <Text className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{t('sleep.duration')}</Text>
              <Text className="mt-1 font-bebas text-4xl leading-none text-indigo-400">{formatDuration(duration)}</Text>
              {awakeMinutes > 0 && totalInBed > 0 && (
                <Text className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {t('sleep.inBed')}: {formatDuration(totalInBed)} · {t('sleep.awakeFor')}: {formatDuration(awakeMinutes)}
                </Text>
              )}
            </View>

            {/* ── Bedtime / wake time ── */}
            <View className="flex-row gap-3">
              <TimeField label={t('sleep.bedtime')} hour={bedHour} minute={bedMinute} setHour={setBedHour} setMinute={setBedMinute} presets={BED_PRESETS} />
              <TimeField label={t('sleep.wakeTime')} hour={wakeHour} minute={wakeMinute} setHour={setWakeHour} setMinute={setWakeMinute} presets={WAKE_PRESETS} />
            </View>

            {/* ── Awakenings ── */}
            <View>
              <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{t('sleep.awakenings')}</Text>
              <View className="flex-row items-center gap-3">
                <Stepper
                  value={awakenings}
                  onChange={(v) => { setAwakenings(v); if (v === 0) setAwakeMinutes(0) }}
                  min={0}
                  max={20}
                />
                <Text className="font-mono text-[11px] text-muted-foreground">
                  {awakenings === 0 ? t('sleep.none') : t('sleep.times', { count: awakenings })}
                </Text>
              </View>
            </View>

            {/* ── Awake minutes (solo si hay despertares) ── */}
            {awakenings > 0 && (
              <View>
                <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{t('sleep.awakeTime')}</Text>
                <View className="flex-row items-center gap-3">
                  <Stepper
                    value={awakeMinutes}
                    onChange={setAwakeMinutes}
                    step={15}
                    min={0}
                    max={480}
                    format={(v) => (v >= 60 ? `${Math.floor(v / 60)}h${v % 60 > 0 ? v % 60 : ''}` : `${v}m`)}
                  />
                  <Text className="flex-1 font-mono text-[10px] text-muted-foreground">{t('sleep.awakeTimeHint')}</Text>
                </View>
              </View>
            )}

            {/* ── Quality ── */}
            <View>
              <Text className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{t('sleep.quality')}</Text>
              <View className="flex-row gap-2">
                {[1, 2, 3, 4, 5].map((q) => {
                  const active = quality === q
                  const colors = QUALITY_COLORS[q]
                  return (
                    <Pressable
                      key={q}
                      onPress={() => { haptics.selection(); setQuality(q) }}
                      className={cn(
                        'flex-1 items-center justify-center gap-0.5 rounded-lg border-2 py-2.5',
                        active ? colors.border : 'border-border',
                        active && colors.bg,
                      )}
                    >
                      <View className="flex-row">
                        {Array.from({ length: q }).map((_, i) => (
                          <Star key={i} size={11} color={active ? colors.text : 'rgba(255,255,255,0.35)'} fill={active ? colors.text : 'none'} />
                        ))}
                      </View>
                      <Text className="font-mono text-[8px] leading-none" style={{ color: active ? colors.text : 'rgba(255,255,255,0.4)' }}>
                        {t(QUALITY_LABEL_KEYS[q])}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* ── Expand toggle ── */}
            <Pressable
              onPress={() => setExpanded(!expanded)}
              className="flex-row items-center gap-1.5 self-start"
            >
              {expanded ? <ChevronUp size={14} color="#a1a1aa" /> : <ChevronDown size={14} color="#a1a1aa" />}
              <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">
                {expanded ? t('sleep.lessDetail') : t('sleep.moreDetail')}
              </Text>
            </Pressable>

            {/* ── Expanded fields ── */}
            {expanded && (
              <View className="gap-4 border-t border-border/60 pt-3">
                {/* Caffeine toggle */}
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-[13px] text-foreground">{t('sleep.caffeineAfter14')}</Text>
                    <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground">{t('sleep.caffeineExamples')}</Text>
                  </View>
                  <Pressable
                    onPress={() => { haptics.selection(); setCaffeine(!caffeine) }}
                    className={cn('h-7 w-12 rounded-full', caffeine ? 'bg-indigo-500' : 'bg-muted')}
                  >
                    <View className={cn('absolute top-1 size-5 rounded-full bg-white shadow-sm', caffeine ? 'left-6' : 'left-1')} />
                  </Pressable>
                </View>

                {/* Screen before bed toggle */}
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-[13px] text-foreground">{t('sleep.screenBeforeBed')}</Text>
                    <Text className="mt-0.5 font-mono text-[10px] text-muted-foreground">{t('sleep.screenLastHour')}</Text>
                  </View>
                  <Pressable
                    onPress={() => { haptics.selection(); setScreenBed(!screenBed) }}
                    className={cn('h-7 w-12 rounded-full', screenBed ? 'bg-indigo-500' : 'bg-muted')}
                  >
                    <View className={cn('absolute top-1 size-5 rounded-full bg-white shadow-sm', screenBed ? 'left-6' : 'left-1')} />
                  </Pressable>
                </View>

                {/* Stress level */}
                <View>
                  <Text className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{t('sleep.stressLevel')}</Text>
                  <View className="flex-row gap-2">
                    {[1, 2, 3, 4, 5].map((s) => {
                      const active = stressLevel === s
                      const color = s <= 2 ? '#10b981' : s === 3 ? '#fbbf24' : '#ef4444'
                      return (
                        <Pressable
                          key={s}
                          onPress={() => { haptics.selection(); setStressLevel(stressLevel === s ? 0 : s) }}
                          className={cn('flex-1 items-center justify-center rounded-lg border py-2', active ? '' : 'border-border')}
                          style={active ? { borderColor: color, backgroundColor: `${color}1A` } : undefined}
                        >
                          <Text className="font-mono text-[10px]" style={{ color: active ? color : 'rgba(255,255,255,0.4)' }}>
                            {t(STRESS_LABEL_KEYS[s])}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>

                {/* Note */}
                <View>
                  <Text className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{t('sleep.noteOptional')}</Text>
                  <Textarea
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('sleep.notePlaceholder')}
                    className="h-20 text-sm"
                    maxLength={500}
                  />
                </View>
              </View>
            )}

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* ── Actions ── */}
          <View className="flex-row gap-3 border-t border-border/50 px-4 py-3">
            <Button variant="outline" className="h-11 flex-1" onPress={handleClose} disabled={saving}>
              <Text className="font-mono text-xs tracking-wide">{t('common.cancel').toUpperCase()}</Text>
            </Button>
            <Button
              className="h-11 flex-1 bg-indigo-500 active:bg-indigo-400"
              onPress={handleSubmit}
              disabled={!isValid || saving}
            >
              <Text className="font-bebas text-lg tracking-wide text-white">
                {saving ? `${t('common.save')}…` : t('common.save').toUpperCase()}
              </Text>
            </Button>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}
