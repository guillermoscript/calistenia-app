/**
 * RemindersTab — React Native port of apps/web/src/pages/RemindersPage.tsx
 *
 * Manages meal, workout, and pause (active-break) reminders. Integrates with
 * the OS-level local-notification scheduler via @/lib/reminder-scheduler.
 *
 * Color strategy:
 *   amber/sky/violet are NOT in the mobile tailwind config (only semantic tokens
 *   and `lime` are defined). Type-accent colors use inline `style` props with
 *   literal hex values throughout this file.
 *     meal   → amber  #F59E0B  (Tailwind amber-400 equivalent)
 *     workout → sky   #38BDF8  (sky-400)
 *     pause  → violet #A78BFA  (violet-400)
 *     next   → lime   (uses className `text-lime` / bg-lime from config)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  AppState,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import {
  Bell,
  Pencil,
  X,
  Check,
  ChevronLeft,
} from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'

import { useMealReminders } from '@calistenia/core/hooks/useMealReminders'
import { useWorkoutReminders } from '@calistenia/core/hooks/useWorkoutReminders'
import type { MealType } from '@calistenia/core/types'

import {
  syncReminders,
  ensureReminderPermission,
  getReminderPermission,
  type ReminderPermStatus,
} from '@/lib/reminder-scheduler'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS_KEYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const

/** JS day ids in display order: Mon(1)…Sat(6), Sun(0) */
const DAY_LABELS_STATIC = [
  { id: 1, label: 'L' },
  { id: 2, label: 'M' },
  { id: 3, label: 'X' },
  { id: 4, label: 'J' },
  { id: 5, label: 'V' },
  { id: 6, label: 'S' },
  { id: 0, label: 'D' },
]

// Inline colors (not in tailwind config)
const ACCENT = {
  meal:    { dot: '#F59E0B', text: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)' },
  workout: { dot: '#38BDF8', text: '#38BDF8', bg: 'rgba(56,189,248,0.08)',  border: 'rgba(56,189,248,0.2)'  },
  pause:   { dot: '#A78BFA', text: '#A78BFA', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
} as const

const MEAL_ICONS: Record<string, string> = {
  desayuno: '☀️',
  almuerzo: '🍽️',
  cena:     '🌙',
  snack:    '🍎',
}

const MEAL_QUICK_TIMES = [['07', '00'], ['12', '00'], ['15', '00'], ['20', '00']]
const WORKOUT_QUICK_TIMES = [['06', '00'], ['07', '00'], ['08', '00'], ['18', '00']]
const PAUSE_INTERVALS = ['25', '30', '45', '60'] as const

type ReminderKind = 'meal' | 'workout' | 'pause'

interface TimelineItem {
  id: string
  type: 'meal' | 'workout' | 'pause'
  hour: number
  minute: number
  days: number[]
  enabled: boolean
  label: string
  subLabel?: string
  mealType?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampHour(val: string): string {
  const n = parseInt(val)
  if (isNaN(n)) return '00'
  return String(Math.min(23, Math.max(0, n))).padStart(2, '0')
}

function clampMinute(val: string): string {
  const n = parseInt(val)
  if (isNaN(n)) return '00'
  return String(Math.min(59, Math.max(0, n))).padStart(2, '0')
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RemindersScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme } = useColorScheme()
  // lime token resuelto a color literal — RN no resuelve var(--lime) en style inline
  const LIME = colorScheme === 'dark' ? 'hsl(74 90% 57%)' : 'hsl(74 90% 38%)'
  const authUser = useAuthUser()
  const userId = authUser?.id ?? null

  // ── Data hooks ───────────────────────────────────────────────────────────────
  const {
    reminders: mealReminders,
    saveReminder: saveMealReminder,
    updateReminder: updateMealReminder,
    toggleReminder: toggleMealReminder,
    deleteReminder: deleteMealReminder,
  } = useMealReminders(userId)

  const {
    reminders: workoutReminders,
    saveReminder: saveWorkoutReminder,
    updateReminder: updateWorkoutReminder,
    toggleReminder: toggleWorkoutReminder,
    deleteReminder: deleteWorkoutReminder,
  } = useWorkoutReminders(userId)

  // ── i18n computed labels ─────────────────────────────────────────────────────
  const DAY_LABELS = useMemo(
    () => DAY_LABELS_STATIC.map((d, i) => ({ ...d, full: t(`day.${DAY_LABELS_KEYS[i]}`) })),
    [t],
  )

  const MEAL_META = useMemo(
    () => ({
      desayuno: { icon: MEAL_ICONS.desayuno, label: t('meal.desayuno') },
      almuerzo: { icon: MEAL_ICONS.almuerzo, label: t('meal.almuerzo') },
      cena:     { icon: MEAL_ICONS.cena,     label: t('meal.cena') },
      snack:    { icon: MEAL_ICONS.snack,    label: t('meal.snack') },
    } as Record<string, { icon: string; label: string }>),
    [t],
  )

  // ── Permission state ─────────────────────────────────────────────────────────
  const [permStatus, setPermStatus] = useState<ReminderPermStatus>('undetermined')

  const refreshPerm = useCallback(async () => {
    const status = await getReminderPermission()
    setPermStatus(status)
  }, [])

  // On mount and on app foreground
  useEffect(() => {
    refreshPerm()
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshPerm()
    })
    return () => sub.remove()
  }, [refreshPerm])

  // ── Sync local notifications whenever reminders change ───────────────────────
  const mealRemindersRef = useRef(mealReminders)
  const workoutRemindersRef = useRef(workoutReminders)
  mealRemindersRef.current = mealReminders
  workoutRemindersRef.current = workoutReminders

  const reschedule = useCallback(() => {
    syncReminders(mealRemindersRef.current, workoutRemindersRef.current)
  }, [])

  useEffect(() => {
    reschedule()
  }, [mealReminders, workoutReminders, reschedule])

  // ── Timeline ─────────────────────────────────────────────────────────────────
  const timeline = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = []

    mealReminders.forEach((r) => {
      const meta = MEAL_META[r.mealType] ?? MEAL_META.almuerzo
      items.push({
        id: `meal-${r.id}`,
        type: 'meal',
        hour: r.hour,
        minute: r.minute,
        days: r.daysOfWeek,
        enabled: r.enabled,
        label: meta.label,
        subLabel: meta.icon,
        mealType: r.mealType,
      })
    })

    workoutReminders.forEach((r) => {
      const isPause = r.reminderType === 'pause'
      items.push({
        id: `workout-${r.id}`,
        type: isPause ? 'pause' : 'workout',
        hour: r.hour,
        minute: r.minute,
        days: r.daysOfWeek,
        enabled: r.enabled,
        label: isPause ? t('reminders.pauseType') : t('reminders.workoutType'),
        subLabel: isPause ? '🧘' : undefined,
      })
    })

    items.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
    return items
  }, [mealReminders, workoutReminders, MEAL_META, t])

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState<ReminderKind | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<TimelineItem | null>(null)

  // Form state
  const [mealType, setMealType] = useState<MealType>('almuerzo')
  const [hour, setHour] = useState('12')
  const [minute, setMinute] = useState('00')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [pauseInterval, setPauseInterval] = useState('25')
  const [pauseHourStart, setPauseHourStart] = useState('09')
  const [pauseHourEnd, setPauseHourEnd] = useState('18')

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const openForm = (type: ReminderKind) => {
    haptics.selection()
    setError(null)
    setPendingDeleteId(null)
    setEditingItem(null)
    setDays([1, 2, 3, 4, 5])
    if (type === 'meal') { setMealType('almuerzo'); setHour('12'); setMinute('00') }
    else if (type === 'workout') { setHour('08'); setMinute('00') }
    else { setPauseInterval('25'); setPauseHourStart('09'); setPauseHourEnd('18') }
    setShowForm(showForm === type ? null : type)
  }

  const toggleDay = (id: number) => {
    haptics.selection()
    setDays((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id].sort(),
    )
  }

  const handleEnableNotifications = async () => {
    const granted = await ensureReminderPermission()
    if (granted) {
      setPermStatus('granted')
      reschedule()
    } else {
      setPermStatus('denied')
      Alert.alert(
        'Notificaciones',
        t('reminders.permissionNeeded'),
        [{ text: 'OK' }],
      )
    }
  }

  const handleSave = async () => {
    if (days.length === 0) return
    setSaving(true)
    setError(null)
    try {
      // Ensure permission before saving so the scheduler won't silently bail
      if (permStatus !== 'granted') {
        await ensureReminderPermission()
        const status = await getReminderPermission()
        setPermStatus(status)
      }

      const h = Math.min(23, Math.max(0, parseInt(hour) || 0))
      const m = Math.min(59, Math.max(0, parseInt(minute) || 0))

      if (showForm === 'meal') {
        await saveMealReminder(mealType, h, m, days)
      } else if (showForm === 'workout') {
        await saveWorkoutReminder(h, m, days)
      } else if (showForm === 'pause') {
        const interval = Math.max(5, parseInt(pauseInterval) || 25)
        const startH = Math.min(23, Math.max(0, parseInt(pauseHourStart) || 9))
        const endH = Math.min(23, Math.max(0, parseInt(pauseHourEnd) || 18))
        if (startH >= endH) {
          setError(t('reminders.startBeforeEnd'))
          setSaving(false)
          return
        }
        // Expand pause window into individual reminders (mirrors web logic exactly)
        for (let hr = startH; hr < endH; hr++) {
          for (let mn = 0; mn < 60; mn += interval) {
            if (hr === startH && mn === 0) continue
            await saveWorkoutReminder(hr, mn, days, 'pause')
          }
        }
      }

      setShowForm(null)
      setTimeout(reschedule, 0)
    } catch {
      setError(t('reminders.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item: TimelineItem) => {
    haptics.selection()
    setEditingItem(item)
    setHour(String(item.hour).padStart(2, '0'))
    setMinute(String(item.minute).padStart(2, '0'))
    setDays([...item.days])
    setShowForm(null)
    setPendingDeleteId(null)
    setError(null)
  }

  const cancelEdit = () => {
    haptics.selection()
    setEditingItem(null)
    setError(null)
  }

  const handleEditSave = async () => {
    if (!editingItem) return
    setSaving(true)
    setError(null)
    try {
      const h = Math.min(23, Math.max(0, parseInt(hour) || 0))
      const m = Math.min(59, Math.max(0, parseInt(minute) || 0))
      const rawId = editingItem.id.replace(/^(meal|workout)-/, '')
      if (editingItem.type === 'meal') {
        await updateMealReminder(rawId, h, m, days)
      } else {
        await updateWorkoutReminder(rawId, h, m, days)
      }
      setEditingItem(null)
      setTimeout(reschedule, 0)
    } catch {
      setError(t('reminders.updateError'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item: TimelineItem) => {
    if (busyIds.has(item.id)) return
    haptics.selection()
    setBusyIds((prev) => new Set(prev).add(item.id))
    try {
      const rawId = item.id.replace(/^(meal|workout)-/, '')
      if (item.type === 'meal') {
        await toggleMealReminder(rawId, !item.enabled)
      } else {
        await toggleWorkoutReminder(rawId)
      }
      setTimeout(reschedule, 0)
    } catch {
      console.warn('Error toggling reminder')
    } finally {
      setBusyIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  const handleDelete = async (item: TimelineItem) => {
    if (busyIds.has(item.id)) return
    haptics.medium()
    setBusyIds((prev) => new Set(prev).add(item.id))
    setPendingDeleteId(null)
    try {
      const rawId = item.id.replace(/^(meal|workout)-/, '')
      if (item.type === 'meal') {
        await deleteMealReminder(rawId)
      } else {
        await deleteWorkoutReminder(rawId)
      }
      setTimeout(reschedule, 0)
    } catch {
      console.warn('Error deleting reminder')
    } finally {
      setBusyIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  // ── Shared sub-components ─────────────────────────────────────────────────────

  /** Hour : Minute number inputs with quick-time preset chips */
  const TimeAndDays = ({ quickTimes }: { quickTimes: string[][] }) => (
    <View>
      {/* HH:MM inputs */}
      <View className="flex-row items-center mb-3">
        <TextInput
          value={hour}
          onChangeText={setHour}
          onBlur={() => setHour(clampHour(hour))}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel="Hora"
          className="w-16 h-14 text-center text-foreground bg-muted/30 rounded-xl border-0 font-bebas text-3xl"
          style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 30, color: 'white', textAlign: 'center' }}
        />
        <Text className="font-bebas text-3xl text-muted-foreground mx-1" style={{ opacity: 0.4 }}>:</Text>
        <TextInput
          value={minute}
          onChangeText={setMinute}
          onBlur={() => setMinute(clampMinute(minute))}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel="Minutos"
          className="w-16 h-14 text-center text-foreground bg-muted/30 rounded-xl border-0 font-bebas text-3xl"
          style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 30, color: 'white', textAlign: 'center' }}
        />
      </View>

      {/* Quick-time presets */}
      <View className="flex-row gap-1.5 mb-4">
        {quickTimes.map(([h, m]) => {
          const active = hour === h && minute === m
          return (
            <Pressable
              key={`${h}${m}`}
              onPress={() => { haptics.selection(); setHour(h); setMinute(m) }}
              className={cn(
                'flex-1 py-2 rounded-xl items-center',
                active ? 'bg-lime/15' : 'bg-muted/20',
              )}
            >
              <Text
                className="font-mono text-[11px]"
                style={{ color: active ? LIME : 'rgba(255,255,255,0.35)' }}
              >
                {h}:{m}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* Days selector */}
      <View className="flex-row gap-1 mb-4">
        {DAY_LABELS.map((d) => {
          const active = days.includes(d.id)
          return (
            <Pressable
              key={d.id}
              onPress={() => toggleDay(d.id)}
              accessibilityRole="button"
              accessibilityLabel={d.full}
              className={cn(
                'flex-1 h-9 rounded-xl items-center justify-center',
                active ? 'bg-lime/10 border border-lime/20' : 'bg-muted/20',
              )}
            >
              <Text
                className="font-mono text-[11px]"
                style={{ color: active ? LIME : 'rgba(255,255,255,0.3)' }}
              >
                {d.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )

  /** Inline edit form rendered inside the timeline for an existing item */
  const EditForm = ({ item }: { item: TimelineItem }) => {
    const acc = ACCENT[item.type]
    return (
      <View
        className="mx-0 p-4 rounded-xl mb-1"
        style={{ backgroundColor: acc.bg, borderWidth: 1, borderColor: acc.border }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            {item.subLabel ? <Text className="text-sm">{item.subLabel}</Text> : null}
            <Text className="text-sm font-sans-medium text-foreground">{item.label}</Text>
            <Text className="font-mono text-[10px] tracking-widest uppercase" style={{ color: acc.text }}>
              {item.type === 'meal'
                ? t('reminders.mealType')
                : item.type === 'workout'
                ? t('reminders.workoutType')
                : t('reminders.pauseType')}
            </Text>
          </View>
          <Pressable
            onPress={cancelEdit}
            className="size-8 items-center justify-center rounded-lg"
            accessibilityLabel={t('common.cancel')}
          >
            <X size={14} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>

        <TimeAndDays quickTimes={item.type === 'meal' ? MEAL_QUICK_TIMES : WORKOUT_QUICK_TIMES} />

        {error ? (
          <Text className="text-[11px] text-red-400 mb-3">{error}</Text>
        ) : null}

        <View className="flex-row gap-2">
          <Pressable
            onPress={handleEditSave}
            disabled={saving || days.length === 0}
            className="flex-1 h-10 rounded-xl items-center justify-center bg-lime"
            style={{ opacity: saving || days.length === 0 ? 0.5 : 1 }}
          >
            <Text className="font-bebas text-base tracking-widest text-zinc-900">
              {saving ? t('common.loading') : t('common.save').toUpperCase()}
            </Text>
          </Pressable>
          <Pressable
            onPress={cancelEdit}
            className="h-10 px-4 rounded-xl items-center justify-center bg-muted/20"
          >
            <Text className="font-mono text-[11px] text-muted-foreground">{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-4 pb-32"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View className="pt-2 pb-2 mb-6">
          <Pressable
            onPress={() => { haptics.selection(); router.back() }}
            className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
            accessibilityRole="button"
            accessibilityLabel={t('common.back', { defaultValue: 'Atrás' })}
          >
            <ChevronLeft size={24} color="rgba(255,255,255,0.55)" />
          </Pressable>
          <Text className="font-bebas text-4xl text-foreground">{t('reminders.title')}</Text>

          {/* Counts + permission status row */}
          <View className="flex-row items-center gap-3 mt-2 flex-wrap">
            <View className="flex-row items-center gap-1.5">
              <View className="size-2 rounded-full" style={{ backgroundColor: ACCENT.meal.dot }} />
              <Text className="font-mono text-[10px] text-muted-foreground">
                {mealReminders.length} {t('reminders.mealType').toLowerCase()}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="size-2 rounded-full" style={{ backgroundColor: ACCENT.workout.dot }} />
              <Text className="font-mono text-[10px] text-muted-foreground">
                {workoutReminders.filter((r) => r.reminderType !== 'pause').length}{' '}
                {t('reminders.workoutType').toLowerCase()}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="size-2 rounded-full" style={{ backgroundColor: ACCENT.pause.dot }} />
              <Text className="font-mono text-[10px] text-muted-foreground">
                {workoutReminders.filter((r) => r.reminderType === 'pause').length}{' '}
                {t('reminders.pauseType').toLowerCase()}
              </Text>
            </View>
            <View className="flex-1 items-end">
              {permStatus === 'granted' ? (
                <Text className="font-mono text-[10px]" style={{ color: 'rgba(74,222,128,0.7)' }}>
                  notif. activas
                </Text>
              ) : permStatus === 'denied' ? (
                <Pressable onPress={handleEnableNotifications}>
                  <Text className="font-mono text-[10px]" style={{ color: 'rgba(248,113,113,0.8)' }}>
                    notif. bloqueadas
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={handleEnableNotifications}>
                  <Text className="font-mono text-[10px]" style={{ color: 'rgba(251,191,36,0.8)' }}>
                    activar notif.
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* ── Add-new buttons ──────────────────────────────────────────────── */}
        <View className="flex-row gap-2 mb-6">
          {(
            [
              { type: 'meal' as const,    label: t('reminders.mealType'),    icon: '🍽️', acc: ACCENT.meal },
              { type: 'workout' as const, label: t('reminders.workoutType'), icon: '💪', acc: ACCENT.workout },
              { type: 'pause' as const,   label: t('reminders.pauseType'),   icon: '🧘', acc: ACCENT.pause },
            ] as const
          ).map(({ type, label, icon, acc }) => {
            const active = showForm === type
            return (
              <Pressable
                key={type}
                onPress={() => openForm(type)}
                className="flex-1 py-3 rounded-xl items-center"
                style={{
                  backgroundColor: active ? acc.bg : 'rgba(255,255,255,0.05)',
                  borderWidth: active ? 1 : 0,
                  borderColor: acc.border,
                }}
              >
                <Text className="text-base mb-0.5">{icon}</Text>
                <Text
                  className="font-mono text-[10px] tracking-widest"
                  style={{ color: active ? acc.text : 'rgba(255,255,255,0.45)' }}
                >
                  {label}
                </Text>
                {active && (
                  <View
                    className="absolute top-2 right-2 size-1.5 rounded-full"
                    style={{ backgroundColor: acc.dot }}
                  />
                )}
              </Pressable>
            )
          })}
        </View>

        {/* ── Create Form ──────────────────────────────────────────────────── */}
        {showForm && !editingItem && (
          <View className="mb-8">
            {/* Accent separator */}
            <View
              className="h-px mb-5"
              style={{
                backgroundColor: showForm === 'meal'
                  ? ACCENT.meal.border
                  : showForm === 'workout'
                  ? ACCENT.workout.border
                  : ACCENT.pause.border,
              }}
            />

            {/* Meal-type picker (meal only) */}
            {showForm === 'meal' && (
              <View className="flex-row gap-2 mb-5">
                {(['desayuno', 'almuerzo', 'cena', 'snack'] as MealType[]).map((type) => {
                  const meta = MEAL_META[type]
                  const active = mealType === type
                  return (
                    <Pressable
                      key={type}
                      onPress={() => { haptics.selection(); setMealType(type) }}
                      className="flex-1 py-3 rounded-xl items-center"
                      style={{
                        backgroundColor: active ? ACCENT.meal.bg : 'rgba(255,255,255,0.04)',
                        borderWidth: active ? 1 : 0,
                        borderColor: ACCENT.meal.border,
                      }}
                    >
                      <Text className="text-lg mb-0.5">{meta.icon}</Text>
                      <Text
                        className="font-mono text-[10px] tracking-wide"
                        style={{ color: active ? ACCENT.meal.text : 'rgba(255,255,255,0.4)' }}
                      >
                        {meta.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            )}

            {/* Time + days (meal / workout) */}
            {showForm !== 'pause' ? (
              <TimeAndDays quickTimes={showForm === 'meal' ? MEAL_QUICK_TIMES : WORKOUT_QUICK_TIMES} />
            ) : (
              /* Pause form: interval + work-hour range */
              <View className="mb-4">
                {/* Interval picker */}
                <Text className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
                  Cada
                </Text>
                <View className="flex-row gap-1.5 mb-5">
                  {PAUSE_INTERVALS.map((v) => {
                    const active = pauseInterval === v
                    return (
                      <Pressable
                        key={v}
                        onPress={() => { haptics.selection(); setPauseInterval(v) }}
                        className="flex-1 py-2.5 rounded-xl items-center"
                        style={{
                          backgroundColor: active ? ACCENT.pause.bg : 'rgba(255,255,255,0.04)',
                          borderWidth: active ? 1 : 0,
                          borderColor: ACCENT.pause.border,
                        }}
                      >
                        <Text
                          className="font-mono text-sm"
                          style={{ color: active ? ACCENT.pause.text : 'rgba(255,255,255,0.45)' }}
                        >
                          {v}<Text className="text-[10px]">m</Text>
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>

                {/* Work-hour range */}
                <Text className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
                  Horario laboral
                </Text>
                <View className="flex-row items-center gap-2 mb-4">
                  <TextInput
                    value={pauseHourStart}
                    onChangeText={setPauseHourStart}
                    onBlur={() => setPauseHourStart(clampHour(pauseHourStart))}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityLabel="Hora de inicio"
                    style={{
                      width: 56,
                      height: 48,
                      fontFamily: 'BebasNeue_400Regular',
                      fontSize: 26,
                      color: 'white',
                      textAlign: 'center',
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      borderRadius: 12,
                    }}
                  />
                  <View className="items-center">
                    <View className="w-4 h-px bg-muted-foreground" style={{ opacity: 0.3 }} />
                    <Text className="font-mono text-[10px] text-muted-foreground" style={{ opacity: 0.4 }}>a</Text>
                    <View className="w-4 h-px bg-muted-foreground" style={{ opacity: 0.3 }} />
                  </View>
                  <TextInput
                    value={pauseHourEnd}
                    onChangeText={setPauseHourEnd}
                    onBlur={() => setPauseHourEnd(clampHour(pauseHourEnd))}
                    keyboardType="number-pad"
                    maxLength={2}
                    accessibilityLabel="Hora de fin"
                    style={{
                      width: 56,
                      height: 48,
                      fontFamily: 'BebasNeue_400Regular',
                      fontSize: 26,
                      color: 'white',
                      textAlign: 'center',
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      borderRadius: 12,
                    }}
                  />
                  <Text className="font-mono text-[10px] text-muted-foreground" style={{ opacity: 0.4 }}>hrs</Text>
                </View>

                {/* Days selector for pause */}
                <View className="flex-row gap-1 mb-4">
                  {DAY_LABELS.map((d) => {
                    const active = days.includes(d.id)
                    return (
                      <Pressable
                        key={d.id}
                        onPress={() => toggleDay(d.id)}
                        accessibilityRole="button"
                        accessibilityLabel={d.full}
                        className={cn('flex-1 h-9 rounded-xl items-center justify-center', active ? 'bg-lime/10' : 'bg-muted/20')}
                      >
                        <Text
                          className="font-mono text-[11px]"
                          style={{ color: active ? LIME : 'rgba(255,255,255,0.3)' }}
                        >
                          {d.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )}

            {/* Error */}
            {error ? (
              <Text className="font-mono text-[11px] text-red-400 mb-3">! {error}</Text>
            ) : null}

            {/* Permission hint */}
            {permStatus !== 'granted' && (
              <Pressable
                onPress={handleEnableNotifications}
                className="flex-row items-center gap-2 mb-3 px-3 py-2.5 rounded-lg"
                style={{ backgroundColor: 'rgba(251,191,36,0.05)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.15)' }}
              >
                <Bell size={12} color="rgba(251,191,36,0.8)" />
                <Text className="font-mono text-[11px] flex-1" style={{ color: 'rgba(251,191,36,0.8)' }}>
                  {t('reminders.permissionNeeded')}
                </Text>
              </Pressable>
            )}

            {/* Save button */}
            <Pressable
              onPress={handleSave}
              disabled={saving || days.length === 0}
              className="w-full h-12 rounded-xl items-center justify-center bg-lime"
              style={{ opacity: saving || days.length === 0 ? 0.5 : 1 }}
            >
              <Text className="font-bebas text-lg tracking-widest text-zinc-900">
                {saving ? t('common.loading') : t('common.save').toUpperCase()}
              </Text>
            </Pressable>

            {/* Bottom separator */}
            <View
              className="h-px mt-6"
              style={{
                backgroundColor: showForm === 'meal'
                  ? ACCENT.meal.border
                  : showForm === 'workout'
                  ? ACCENT.workout.border
                  : ACCENT.pause.border,
              }}
            />
          </View>
        )}

        {/* ── Permission banner (no form, reminders exist) ─────────────────── */}
        {!showForm && !editingItem && permStatus === 'denied' && timeline.length > 0 && (
          <View
            className="mb-6 px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'rgba(248,113,113,0.05)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.15)' }}
          >
            <Text className="font-sans-medium text-[12px] mb-1" style={{ color: '#F87171' }}>
              Notificaciones bloqueadas
            </Text>
            <Text className="text-[11px] text-muted-foreground leading-relaxed">
              Los recordatorios están guardados pero no recibirás alertas. Ve a Configuración de tu dispositivo → Notificaciones y permite esta app.
            </Text>
          </View>
        )}

        {/* ── Timeline ────────────────────────────────────────────────────── */}
        {timeline.length > 0 ? (
          <View className="relative">
            {/* Vertical guide line */}
            <View
              className="absolute top-0 bottom-0"
              style={{ left: 42, width: 1, backgroundColor: 'rgba(255,255,255,0.08)' }}
            />

            <View className="gap-0.5">
              {timeline.map((item) => {
                const acc = ACCENT[item.type]
                const timeStr = `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`
                const isConfirmingDelete = pendingDeleteId === item.id
                const isEditing = editingItem?.id === item.id
                const isBusy = busyIds.has(item.id)

                if (isEditing) {
                  return (
                    <View key={item.id} className="ml-14">
                      <EditForm item={item} />
                    </View>
                  )
                }

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => startEdit(item)}
                    className="flex-row items-center gap-0"
                    style={{ opacity: item.enabled ? 1 : 0.4 }}
                    disabled={isBusy}
                  >
                    {/* Time column */}
                    <View className="w-11 items-end pr-2">
                      <Text
                        className="font-mono text-[13px]"
                        style={{ color: 'rgba(255,255,255,0.55)' }}
                      >
                        {timeStr}
                      </Text>
                    </View>

                    {/* Dot */}
                    <View className="w-4 items-center justify-center z-10">
                      <View
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: item.enabled ? acc.dot : 'rgba(255,255,255,0.2)' }}
                      />
                    </View>

                    {/* Content row */}
                    <View
                      className="flex-1 flex-row items-center gap-2 ml-2 py-2 px-2.5 rounded-xl"
                      style={{ backgroundColor: 'transparent' }}
                    >
                      <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-1.5 flex-wrap">
                          {item.subLabel ? <Text className="text-sm">{item.subLabel}</Text> : null}
                          <Text className="text-[13px] font-sans-medium text-foreground" numberOfLines={1}>
                            {item.label}
                          </Text>
                          <Text
                            className="font-mono text-[10px] tracking-widest uppercase"
                            style={{ color: acc.text }}
                          >
                            {item.type === 'meal'
                              ? t('reminders.mealType')
                              : item.type === 'workout'
                              ? t('reminders.workoutType')
                              : t('reminders.pauseType')}
                          </Text>
                        </View>
                        {/* Days indicators */}
                        <View className="flex-row gap-1 mt-0.5">
                          {DAY_LABELS.map((d) => (
                            <Text
                              key={d.id}
                              className="font-mono text-[10px] leading-none"
                              style={{ color: item.days.includes(d.id) ? acc.text : 'rgba(255,255,255,0.15)' }}
                            >
                              {d.label}
                            </Text>
                          ))}
                        </View>
                      </View>

                      {/* Pencil icon hint */}
                      <View className="shrink-0 size-8 items-center justify-center">
                        <Pencil size={13} color="rgba(255,255,255,0.2)" />
                      </View>

                      {/* Toggle */}
                      <Pressable
                        onPress={(e) => { e.stopPropagation?.(); handleToggle(item) }}
                        className="shrink-0 size-11 items-center justify-center"
                        disabled={isBusy}
                        accessibilityRole="switch"
                        accessibilityLabel={`${item.enabled ? 'Desactivar' : 'Activar'} ${item.label}`}
                        accessibilityState={{ checked: item.enabled }}
                      >
                        {/* Custom inline toggle (matches web style) */}
                        <View
                          className="w-9 h-[22px] rounded-full justify-center"
                          style={{
                            backgroundColor: item.enabled ? LIME : 'rgba(255,255,255,0.15)',
                          }}
                        >
                          <View
                            className="absolute size-[18px] rounded-full bg-white"
                            style={{
                              top: 2,
                              left: item.enabled ? 18 : 2,
                              shadowColor: '#000',
                              shadowOpacity: 0.15,
                              shadowRadius: 2,
                              elevation: 2,
                            }}
                          />
                        </View>
                      </Pressable>

                      {/* Delete (confirm pattern) */}
                      {isConfirmingDelete ? (
                        <View className="flex-row items-center gap-0.5 shrink-0 -mr-1.5">
                          <Pressable
                            onPress={() => handleDelete(item)}
                            className="size-11 items-center justify-center rounded-lg"
                            disabled={isBusy}
                            accessibilityLabel={t('common.confirm')}
                          >
                            <Check size={16} color="#F87171" />
                          </Pressable>
                          <Pressable
                            onPress={() => { haptics.selection(); setPendingDeleteId(null) }}
                            className="size-11 items-center justify-center rounded-lg"
                            accessibilityLabel={t('common.cancel')}
                          >
                            <X size={13} color="rgba(255,255,255,0.35)" />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.()
                            haptics.selection()
                            setPendingDeleteId(item.id)
                            setEditingItem(null)
                          }}
                          className="size-11 items-center justify-center rounded-lg -mr-1.5"
                          accessibilityLabel={t('common.delete')}
                        >
                          <X size={13} color="rgba(255,255,255,0.25)" />
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : !showForm ? (
          /* Empty state */
          <View className="py-16 items-center">
            <View className="size-16 rounded-full bg-muted/30 items-center justify-center mb-6">
              <Bell size={28} color="rgba(255,255,255,0.3)" strokeWidth={1.5} />
            </View>
            <Text className="font-bebas text-xl tracking-wide text-muted-foreground mb-1">
              SIN RECORDATORIOS
            </Text>
            <Text
              className="font-mono text-[11px] text-muted-foreground text-center leading-relaxed"
              style={{ maxWidth: 240 }}
            >
              Programa alertas para no saltarte comidas, entrenamientos o pausas activas durante el trabajo
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
