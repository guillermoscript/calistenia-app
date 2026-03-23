import { useState, useEffect, useMemo, useRef } from 'react'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { useMealReminders } from '../hooks/useMealReminders'
import { useWorkoutReminders } from '../hooks/useWorkoutReminders'
import { subscribeToPush, getSubscriptionStatus, getNotificationSupport, requestNotificationPermission } from '../lib/push-subscription'
import { scheduleAll, buildSchedulableReminders, setupVisibilityRescheduler } from '../lib/reminder-scheduler'
import type { MealType } from '../types'

// ── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = [
  { id: 1, label: 'L', full: 'Lunes' },
  { id: 2, label: 'M', full: 'Martes' },
  { id: 3, label: 'X', full: 'Miércoles' },
  { id: 4, label: 'J', full: 'Jueves' },
  { id: 5, label: 'V', full: 'Viernes' },
  { id: 6, label: 'S', full: 'Sábado' },
  { id: 0, label: 'D', full: 'Domingo' },
]

const TYPE_CONFIG = {
  meal: {
    color: 'text-amber-400',
    bg: 'bg-amber-400',
    bgFaint: 'bg-amber-400/8',
    border: 'border-amber-400/20',
    ring: 'ring-amber-400/30',
    label: 'COMIDA',
  },
  workout: {
    color: 'text-sky-400',
    bg: 'bg-sky-400',
    bgFaint: 'bg-sky-400/8',
    border: 'border-sky-400/20',
    ring: 'ring-sky-400/30',
    label: 'EJERCICIO',
  },
  pause: {
    color: 'text-violet-400',
    bg: 'bg-violet-400',
    bgFaint: 'bg-violet-400/8',
    border: 'border-violet-400/20',
    ring: 'ring-violet-400/30',
    label: 'PAUSA',
  },
} as const

const MEAL_META: Record<string, { icon: string; label: string }> = {
  desayuno: { icon: '☀️', label: 'Desayuno' },
  almuerzo: { icon: '🍽️', label: 'Almuerzo' },
  cena:     { icon: '🌙', label: 'Cena' },
  snack:    { icon: '🍎', label: 'Snack' },
}

const FORM_LABELS: Record<string, string> = {
  meal: 'Nuevo recordatorio de comida',
  workout: 'Nuevo recordatorio de ejercicio',
  pause: 'Nuevas pausas activas',
}

type ReminderType = 'meal' | 'workout' | 'pause'

// Unified reminder shape for the timeline
interface TimelineItem {
  id: string
  type: 'meal' | 'workout' | 'pause'
  hour: number
  minute: number
  days: number[]
  enabled: boolean
  label: string
  subLabel?: string
}

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

// ── Page ─────────────────────────────────────────────────────────────────────

interface RemindersPageProps {
  userId: string | null
}

export default function RemindersPage({ userId }: RemindersPageProps) {
  const {
    reminders: mealReminders,
    saveReminder: saveMealReminder,
    toggleReminder: toggleMealReminder,
    deleteReminder: deleteMealReminder,
  } = useMealReminders(userId)
  const {
    reminders: workoutReminders,
    saveReminder: saveWorkoutReminder,
    toggleReminder: toggleWorkoutReminder,
    deleteReminder: deleteWorkoutReminder,
  } = useWorkoutReminders(userId)

  const [pushEnabled, setPushEnabled] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [showForm, setShowForm] = useState<ReminderType | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // Form state
  const [mealType, setMealType] = useState<MealType>('almuerzo')
  const [hour, setHour] = useState('12')
  const [minute, setMinute] = useState('00')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])

  // Pause form
  const [pauseInterval, setPauseInterval] = useState('25')
  const [pauseHourStart, setPauseHourStart] = useState('09')
  const [pauseHourEnd, setPauseHourEnd] = useState('18')

  useEffect(() => {
    if (!userId) return
    getSubscriptionStatus().then(setPushEnabled).catch(() => {})
    const support = getNotificationSupport()
    setNotifPermission(support.permission)
  }, [userId])

  // ── Build sorted timeline ─────────────────────────────────────────────────
  const timeline = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = []

    mealReminders.forEach(r => {
      const meta = MEAL_META[r.mealType] || MEAL_META.almuerzo
      items.push({
        id: `meal-${r.id}`,
        type: 'meal',
        hour: r.hour,
        minute: r.minute,
        days: r.daysOfWeek,
        enabled: r.enabled,
        label: meta.label,
        subLabel: meta.icon,
      })
    })

    workoutReminders.forEach(r => {
      const isPause = r.reminderType === 'pause'
      items.push({
        id: `workout-${r.id}`,
        type: isPause ? 'pause' : 'workout',
        hour: r.hour,
        minute: r.minute,
        days: r.daysOfWeek,
        enabled: r.enabled,
        label: isPause ? 'Pausa Activa' : 'Entrenamiento',
        subLabel: isPause ? '🧘' : undefined,
      })
    })

    items.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
    return items
  }, [mealReminders, workoutReminders])

  // ── Schedule local notifications for all reminders ───────────────────────
  const visibilitySetup = useRef(false)
  useEffect(() => {
    if (!visibilitySetup.current) {
      visibilitySetup.current = true
      setupVisibilityRescheduler()
    }
    const schedulable = buildSchedulableReminders(mealReminders, workoutReminders)
    scheduleAll(schedulable)
  }, [mealReminders, workoutReminders])

  // ── Notifications ─────────────────────────────────────────────────────────
  const setupNotifications = async (): Promise<void> => {
    setWarning(null)

    const granted = await requestNotificationPermission()
    setNotifPermission(granted ? 'granted' : ('Notification' in window ? Notification.permission : 'unsupported'))

    if (!granted) {
      // Only warn for 'default' state (first prompt dismissed).
      // 'denied' and 'unsupported' are covered by the persistent banner + header indicator.
      const support = getNotificationSupport()
      if (support.permission === 'default') {
        setWarning('Necesitas permitir notificaciones para recibir recordatorios.')
      }
      return
    }

    if (userId) {
      const ok = await subscribeToPush(userId)
      setPushEnabled(ok)
      if (!ok) {
        setWarning('Las notificaciones funcionaran mientras la app este abierta. Para alertas con la app cerrada, instala la app desde el menu del navegador.')
      }
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setWarning(null)
    try {
      const h = parseInt(hour) || 0
      const m = parseInt(minute) || 0
      const clampedH = Math.min(23, Math.max(0, h))
      const clampedM = Math.min(59, Math.max(0, m))

      if (showForm === 'meal') {
        await saveMealReminder(mealType, clampedH, clampedM, days)
      } else if (showForm === 'workout') {
        await saveWorkoutReminder(clampedH, clampedM, days)
      } else if (showForm === 'pause') {
        const interval = Math.max(5, parseInt(pauseInterval) || 25)
        const startH = Math.min(23, Math.max(0, parseInt(pauseHourStart) || 9))
        const endH = Math.min(23, Math.max(0, parseInt(pauseHourEnd) || 18))
        if (startH >= endH) {
          setError('La hora de inicio debe ser menor que la hora de fin.')
          return
        }
        for (let hr = startH; hr < endH; hr++) {
          for (let mn = 0; mn < 60; mn += interval) {
            if (hr === startH && mn === 0) continue
            await saveWorkoutReminder(hr, mn, days, 'pause')
          }
        }
      }

      // Then try to set up notifications (non-blocking)
      await setupNotifications()

      setShowForm(null)
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: TimelineItem) => {
    if (busyIds.has(item.id)) return
    setBusyIds(prev => new Set(prev).add(item.id))
    setPendingDeleteId(null)
    try {
      const rawId = item.id.replace(/^(meal|workout)-/, '')
      if (item.type === 'meal') {
        await deleteMealReminder(rawId)
      } else { // 'workout' or 'pause' — both stored in workout_reminders
        await deleteWorkoutReminder(rawId)
      }
    } catch (e) {
      console.warn('Error deleting reminder:', e)
    } finally {
      setBusyIds(prev => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  const handleToggle = async (item: TimelineItem) => {
    if (busyIds.has(item.id)) return
    setBusyIds(prev => new Set(prev).add(item.id))
    try {
      const rawId = item.id.replace(/^(meal|workout)-/, '')
      if (item.type === 'meal') {
        await toggleMealReminder(rawId, !item.enabled)
      } else { // 'workout' or 'pause'
        await toggleWorkoutReminder(rawId)
      }
    } catch (e) {
      console.warn('Error toggling reminder:', e)
    } finally {
      setBusyIds(prev => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  const toggleDay = (id: number) => {
    setDays(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id].sort())
  }

  const openForm = (type: ReminderType) => {
    setError(null)
    setWarning(null)
    setPendingDeleteId(null)
    setDays([1, 2, 3, 4, 5])
    if (type === 'meal') { setMealType('almuerzo'); setHour('12'); setMinute('00') }
    else if (type === 'workout') { setHour('08'); setMinute('00') }
    else { setPauseInterval('25'); setPauseHourStart('09'); setPauseHourEnd('18') }
    setShowForm(showForm === type ? null : type)
  }

  // Current hour marker
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="font-bebas text-[clamp(2.5rem,8vw,3.5rem)] leading-[0.9] tracking-wide">
          RECORDA&shy;TORIOS
        </div>
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-amber-400" />
            <span className="text-[10px] font-mono tracking-wide text-muted-foreground">
              {mealReminders.length} comida
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-sky-400" />
            <span className="text-[10px] font-mono tracking-wide text-muted-foreground">
              {workoutReminders.filter(r => r.reminderType !== 'pause').length} ejercicio
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-violet-400" />
            <span className="text-[10px] font-mono tracking-wide text-muted-foreground">
              {workoutReminders.filter(r => r.reminderType === 'pause').length} pausas
            </span>
          </div>
          {notifPermission === 'granted' ? (
            <span className="text-[10px] font-mono tracking-wide text-emerald-400/70 ml-auto">
              {pushEnabled ? 'notif. activas' : 'notif. locales'}
            </span>
          ) : notifPermission === 'denied' ? (
            <span className="text-[10px] font-mono tracking-wide text-red-400/70 ml-auto">
              notif. bloqueadas
            </span>
          ) : (
            <span className="text-[10px] font-mono tracking-wide text-amber-400/70 ml-auto">
              notif. pendientes
            </span>
          )}
        </div>
      </div>

      {/* ── Add new ── */}
      <div id="tour-reminders-add" className="flex gap-2 mb-8" role="group" aria-label="Tipo de recordatorio">
        {([
          { type: 'meal' as const, label: 'Comida', icon: '🍽️' },
          { type: 'workout' as const, label: 'Ejercicio', icon: '💪' },
          { type: 'pause' as const, label: 'Pausas', icon: '🧘' },
        ]).map(({ type, label, icon }) => (
          <button
            key={type}
            onClick={() => openForm(type)}
            aria-pressed={showForm === type}
            className={cn(
              'flex-1 relative py-3 rounded-xl transition-all text-center',
              showForm === type
                ? cn('ring-1', TYPE_CONFIG[type].ring, TYPE_CONFIG[type].bgFaint)
                : 'bg-muted/30 hover:bg-muted/50',
            )}
          >
            <div className="text-base mb-0.5">{icon}</div>
            <div className={cn(
              'text-[10px] font-mono tracking-widest',
              showForm === type ? TYPE_CONFIG[type].color : 'text-muted-foreground'
            )}>
              {label}
            </div>
            {/* Active dot */}
            {showForm === type && (
              <div className={cn('absolute top-2 right-2 size-1.5 rounded-full', TYPE_CONFIG[type].bg)} />
            )}
          </button>
        ))}
      </div>

      {/* ── Form ── */}
      {showForm && (
        <fieldset className="mb-8 motion-safe:animate-fade-in border-0 p-0 m-0">
          <legend className="sr-only">{FORM_LABELS[showForm]}</legend>
          {/* Form header line */}
          <div className={cn('h-px mb-5', showForm === 'meal' ? 'bg-amber-400/30' : showForm === 'workout' ? 'bg-sky-400/30' : 'bg-violet-400/30')} />

          {/* Meal type (meal only) */}
          {showForm === 'meal' && (
            <div className="mb-5" role="group" aria-label="Tipo de comida">
              <div className="grid grid-cols-4 gap-2">
                {(['desayuno', 'almuerzo', 'cena', 'snack'] as MealType[]).map(type => {
                  const meta = MEAL_META[type]
                  const active = mealType === type
                  return (
                    <button
                      key={type}
                      onClick={() => setMealType(type)}
                      aria-pressed={active}
                      className={cn(
                        'py-3 rounded-xl transition-all',
                        active
                          ? 'bg-amber-400/10 ring-1 ring-amber-400/30'
                          : 'bg-muted/20 hover:bg-muted/40'
                      )}
                    >
                      <div className="text-lg mb-0.5">{meta.icon}</div>
                      <div className={cn(
                        'text-[10px] font-mono tracking-wide',
                        active ? 'text-amber-400' : 'text-muted-foreground'
                      )}>
                        {meta.label}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Time (meal + workout) */}
          {showForm !== 'pause' ? (
            <div className="mb-5 space-y-3">
              <div className="flex items-center" role="group" aria-label="Hora del recordatorio">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={e => setHour(e.target.value)}
                  onBlur={() => setHour(clampHour(hour))}
                  aria-label="Hora"
                  className="w-[4.5rem] h-14 text-center font-bebas text-3xl bg-muted/30 rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-lime-400/30 tabular-nums"
                />
                <span className="text-2xl text-muted-foreground/40 font-bebas mx-1" aria-hidden="true">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={5}
                  value={minute}
                  onChange={e => setMinute(e.target.value)}
                  onBlur={() => setMinute(clampMinute(minute))}
                  aria-label="Minutos"
                  className="w-[4.5rem] h-14 text-center font-bebas text-3xl bg-muted/30 rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-lime-400/30 tabular-nums"
                />
              </div>
              {/* Quick presets */}
              <div className="flex gap-1.5" role="group" aria-label="Horas predefinidas">
                {(showForm === 'meal'
                  ? [['07', '00'], ['12', '00'], ['15', '00'], ['20', '00']]
                  : [['06', '00'], ['07', '00'], ['08', '00'], ['18', '00']]
                ).map(([h, m]) => (
                  <button
                    key={`${h}${m}`}
                    onClick={() => { setHour(h); setMinute(m) }}
                    aria-pressed={hour === h && minute === m}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-[11px] font-mono tabular-nums transition-colors',
                      hour === h && minute === m
                        ? 'bg-lime-400/15 text-lime-400'
                        : 'bg-muted/20 text-muted-foreground/50 hover:text-muted-foreground'
                    )}
                  >
                    {h}:{m}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Pause settings */
            <div className="mb-5 space-y-4">
              <div>
                <div className="text-[10px] text-muted-foreground/60 tracking-widest uppercase mb-2">Cada</div>
                <div className="flex gap-1.5" role="group" aria-label="Intervalo de pausas">
                  {['25', '30', '45', '60'].map(v => (
                    <button
                      key={v}
                      onClick={() => setPauseInterval(v)}
                      aria-pressed={pauseInterval === v}
                      className={cn(
                        'flex-1 py-2.5 rounded-xl text-sm font-mono transition-all',
                        pauseInterval === v
                          ? 'bg-violet-400/10 ring-1 ring-violet-400/30 text-violet-400'
                          : 'bg-muted/20 text-muted-foreground hover:bg-muted/40'
                      )}
                    >
                      {v}<span className="text-[10px] ml-0.5">m</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground/60 tracking-widest uppercase mb-2">Horario laboral</div>
                <div className="flex items-center gap-2" role="group" aria-label="Rango horario">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={pauseHourStart}
                    onChange={e => setPauseHourStart(e.target.value)}
                    onBlur={() => setPauseHourStart(clampHour(pauseHourStart))}
                    aria-label="Hora de inicio"
                    className="w-16 h-12 text-center font-bebas text-2xl bg-muted/30 rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-violet-400/30 tabular-nums"
                  />
                  <div className="flex flex-col items-center" aria-hidden="true">
                    <div className="w-4 h-px bg-muted-foreground/30" />
                    <span className="text-[10px] text-muted-foreground/40 font-mono">a</span>
                    <div className="w-4 h-px bg-muted-foreground/30" />
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={pauseHourEnd}
                    onChange={e => setPauseHourEnd(e.target.value)}
                    onBlur={() => setPauseHourEnd(clampHour(pauseHourEnd))}
                    aria-label="Hora de fin"
                    className="w-16 h-12 text-center font-bebas text-2xl bg-muted/30 rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-violet-400/30 tabular-nums"
                  />
                  <span className="text-[10px] text-muted-foreground/40 font-mono">hrs</span>
                </div>
              </div>
            </div>
          )}

          {/* Days */}
          <div className="flex gap-1 mb-5" role="group" aria-label="Dias de la semana">
            {DAY_LABELS.map(d => (
              <button
                key={d.id}
                onClick={() => toggleDay(d.id)}
                aria-pressed={days.includes(d.id)}
                aria-label={d.full}
                className={cn(
                  'flex-1 h-10 rounded-xl text-[11px] font-mono transition-all',
                  days.includes(d.id)
                    ? 'bg-lime-400/10 text-lime-400 ring-1 ring-lime-400/20'
                    : 'bg-muted/20 text-muted-foreground/40 hover:text-muted-foreground'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="text-[11px] text-red-400 mb-4 flex items-start gap-2" role="alert">
              <span className="shrink-0 mt-px">!</span>
              {error}
            </div>
          )}

          {warning && (
            <div className="text-[11px] text-amber-400/80 mb-4 flex items-start gap-2 bg-amber-400/5 rounded-lg px-3 py-2.5 border border-amber-400/15" role="status">
              <span className="shrink-0 mt-px">⚠</span>
              {warning}
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={saving || days.length === 0}
            className="w-full h-12 bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas text-lg tracking-widest"
          >
            {saving ? 'GUARDANDO...' : 'GUARDAR'}
          </Button>

          <div className={cn('h-px mt-6', showForm === 'meal' ? 'bg-amber-400/30' : showForm === 'workout' ? 'bg-sky-400/30' : 'bg-violet-400/30')} />
        </fieldset>
      )}

      {/* Notification status banner — hide when form is open to avoid duplicate warnings */}
      {!showForm && notifPermission === 'denied' && timeline.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-red-400/5 border border-red-400/15">
          <div className="text-[12px] text-red-400 font-medium mb-1">Notificaciones bloqueadas</div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            Los recordatorios estan guardados pero no recibiras alertas. Para activarlas, ve a los ajustes de tu navegador → Permisos → Notificaciones y permite este sitio.
          </div>
        </div>
      )}

      {!showForm && notifPermission === 'unsupported' && timeline.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-amber-400/5 border border-amber-400/15">
          <div className="text-[12px] text-amber-400 font-medium mb-1">Notificaciones no soportadas</div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            Tu navegador no soporta notificaciones. Prueba con Chrome, Edge o Safari, o instala la app desde el menu de tu navegador.
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      {timeline.length > 0 ? (
        <div id="tour-reminders-timeline" className="relative">
          {/* Vertical line */}
          <div className="absolute left-[2.75rem] top-0 bottom-0 w-px bg-border/50" />

          <div className="space-y-1">
            {timeline.map((item, i) => {
              const cfg = TYPE_CONFIG[item.type]
              const timeStr = `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`
              const itemMinutes = item.hour * 60 + item.minute
              const isPast = itemMinutes < nowMinutes
              const isNext = !isPast && (i === 0 || (timeline[i - 1].hour * 60 + timeline[i - 1].minute) < nowMinutes)
              const isConfirmingDelete = pendingDeleteId === item.id

              return (
                <div
                  key={item.id}
                  className={cn(
                    'group flex items-center gap-0 transition-[opacity] duration-200',
                    !item.enabled && 'opacity-40',
                  )}
                >
                  {/* Time column */}
                  <div className="w-11 shrink-0 text-right pr-2">
                    <span className={cn(
                      'font-mono text-[13px] tabular-nums leading-none',
                      isNext ? 'text-lime-400' : isPast ? 'text-muted-foreground/40' : 'text-muted-foreground/70',
                    )}>
                      {timeStr}
                    </span>
                  </div>

                  {/* Dot on timeline */}
                  <div className="relative z-10 shrink-0 flex items-center justify-center w-4">
                    <div className={cn(
                      'size-2.5 rounded-full transition-all',
                      isNext ? 'bg-lime-400 ring-2 ring-lime-400/30' : cfg.bg,
                      !item.enabled && 'bg-muted-foreground/30',
                    )} />
                  </div>

                  {/* Content */}
                  <div className={cn(
                    'flex-1 flex items-center gap-2 sm:gap-3 ml-2 py-2 px-2.5 sm:px-3 rounded-xl transition-colors min-w-0',
                    'hover:bg-muted/30',
                    isNext && 'bg-lime-400/[0.04]',
                  )}>
                    {/* Icon + label */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.subLabel && <span className="text-sm">{item.subLabel}</span>}
                        <span className="text-[13px] font-medium text-foreground truncate">{item.label}</span>
                        <span className={cn('text-[10px] font-mono tracking-[0.15em] uppercase shrink-0', cfg.color)}>
                          {cfg.label}
                        </span>
                      </div>
                      {/* Day indicators */}
                      <div className="flex gap-1 mt-0.5">
                        {DAY_LABELS.map(d => (
                          <span
                            key={d.id}
                            className={cn(
                              'text-[10px] font-mono leading-none',
                              item.days.includes(d.id) ? cfg.color : 'text-muted-foreground/20'
                            )}
                          >
                            {d.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Toggle — 44px touch target */}
                    <button
                      role="switch"
                      aria-checked={item.enabled}
                      aria-label={`${item.enabled ? 'Desactivar' : 'Activar'} ${item.label}`}
                      onClick={() => handleToggle(item)}
                      className="shrink-0 flex items-center justify-center w-11 h-11"
                    >
                      <div className={cn(
                        'w-9 h-[22px] rounded-full relative transition-colors',
                        item.enabled ? 'bg-lime-400' : 'bg-muted-foreground/20'
                      )}>
                        <div className={cn(
                          'absolute top-[2px] size-[18px] rounded-full bg-white transition-transform shadow-sm',
                          item.enabled ? 'translate-x-[16px]' : 'translate-x-[2px]'
                        )} />
                      </div>
                    </button>

                    {/* Delete — 44px touch target, with confirmation */}
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-0.5 shrink-0 -mr-1.5">
                        <button
                          onClick={() => handleDelete(item)}
                          className="size-11 flex items-center justify-center text-red-400 rounded-lg transition-colors"
                          aria-label="Confirmar eliminar"
                        >
                          <CheckIcon className="size-4" />
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(null)}
                          className="size-11 flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground rounded-lg transition-colors"
                          aria-label="Cancelar"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPendingDeleteId(item.id)}
                        className="size-11 flex items-center justify-center text-muted-foreground/30 hover:text-red-400 rounded-lg shrink-0 transition-colors sm:opacity-0 sm:group-hover:opacity-100 -mr-1.5"
                        aria-label="Eliminar"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : !showForm && (
        /* Empty state */
        <div className="py-16 text-center">
          <div className="relative inline-block mb-6">
            {/* Decorative rings */}
            <div className="absolute inset-0 rounded-full border border-border/30 scale-[2] opacity-30" />
            <div className="absolute inset-0 rounded-full border border-border/20 scale-[3] opacity-15" />
            <div className="size-16 rounded-full bg-muted/30 flex items-center justify-center">
              <BellIcon className="size-7 text-muted-foreground/40" />
            </div>
          </div>
          <div className="font-bebas text-xl tracking-wide text-muted-foreground/60 mb-1">
            SIN RECORDATORIOS
          </div>
          <p className="text-[11px] text-muted-foreground/40 max-w-[240px] mx-auto leading-relaxed">
            Programa alertas para no saltarte comidas, entrenamientos o pausas activas durante el trabajo
          </p>
        </div>
      )}
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
