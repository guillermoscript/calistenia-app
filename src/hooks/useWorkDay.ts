/**
 * useWorkDay — Work-Day Clock hook
 *
 * Manages check-in/check-out state, 25-min and 60-min pause alerts,
 * live elapsed clock, and today's pause log.
 *
 * Persistence: localStorage only (instant read on mount, no PB round-trip needed).
 * Key: 'calistenia_workday_<YYYY-MM-DD>'  — one record per calendar day.
 *
 * Audio: Web Audio API oscillator pattern (same as RestTimer.jsx / Timer.jsx).
 * Notifications: Browser Notifications API with graceful permission request.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Pause, PauseType, WorkDay } from '../types'
import { todayStr } from '../lib/dateUtils'

const TODAY = (): string => todayStr()
const LS_KEY = (date: string): string => `calistenia_workday_${date}`

// ─── localStorage helpers ─────────────────────────────────────────────────────
function lsLoad(date: string): WorkDay | null {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY(date)) || 'null')
  } catch {
    return null
  }
}
function lsSave(date: string, data: WorkDay): void {
  localStorage.setItem(LS_KEY(date), JSON.stringify(data))
}

// ─── Audio helpers ────────────────────────────────────────────────────────────
// Reuses the same AudioContext pattern from RestTimer.jsx / Timer.jsx
let _audioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return _audioCtx
}

function playBeep(freq: number = 880, duration: number = 0.18, vol: number = 0.25): void {
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch {
    // Silently ignore if audio is blocked
  }
}

function playPauseChime(type: 'short' | 'long' = 'short'): void {
  // short = 25-min alert: two mid-high beeps
  // long  = 60-min alert: three descending tones
  if (type === 'short') {
    playBeep(880, 0.15)
    setTimeout(() => playBeep(1100, 0.2), 200)
  } else {
    playBeep(1100, 0.15)
    setTimeout(() => playBeep(880, 0.15), 220)
    setTimeout(() => playBeep(660, 0.25), 440)
  }
}

// ─── Notification helper ──────────────────────────────────────────────────────
async function requestNotifPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function sendNotif(title: string, body: string): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      silent: true, // audio handled by Web Audio API
    })
  } catch {
    // Some browsers block in certain contexts
  }
}

// ─── Alert messages ───────────────────────────────────────────────────────────
const ALERT_25 = {
  title: 'Pausa Activa — 2 min',
  body: 'Levántate · Hip Flexor · Rotación torácica',
}
const ALERT_60 = {
  title: 'Pausa Activa — 5 min',
  body: 'Glute Bridge · Cat-Cow · Thoracic Rotation',
}

// ─── Return type ─────────────────────────────────────────────────────────────

interface UseWorkDayReturn {
  // State
  workStart: string | null
  workEnd: string | null
  pauses: Pause[]
  elapsed: number
  next25: number | null
  next60: number | null
  isClockedIn: boolean
  isClockedOut: boolean
  // Actions
  checkIn: () => Promise<void>
  checkOut: () => void
  // Helpers
  formatTime: (sec: number | null) => string
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWorkDay(): UseWorkDayReturn {
  const today = TODAY()

  // State — loaded from localStorage on mount
  const [workStart, setWorkStart] = useState<string | null>(null)
  const [workEnd, setWorkEnd]     = useState<string | null>(null)
  const [pauses, setPauses]       = useState<Pause[]>([])
  const [elapsed, setElapsed]     = useState<number>(0)
  const [next25, setNext25]       = useState<number | null>(null)
  const [next60, setNext60]       = useState<number | null>(null)

  // Refs for intervals — stable refs avoid stale closures
  const tickRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const alert25Ref = useRef<ReturnType<typeof setInterval> | null>(null) as React.MutableRefObject<ReturnType<typeof setInterval> | null> & { _initTimeout?: ReturnType<typeof setTimeout> }
  const alert60Ref = useRef<ReturnType<typeof setInterval> | null>(null) as React.MutableRefObject<ReturnType<typeof setInterval> | null> & { _initTimeout?: ReturnType<typeof setTimeout> }
  const pausesRef  = useRef<Pause[]>(pauses) // keep a ref to write into interval callback
  useEffect(() => { pausesRef.current = pauses }, [pauses])

  // ── Persist helper ──────────────────────────────────────────────────────────
  const persist = useCallback((ws: string | null, we: string | null, ps: Pause[]): void => {
    lsSave(today, { workStart: ws, workEnd: we, pauses: ps, date: today })
  }, [today])

  // ── Tick (every second) — updates elapsed + countdowns ─────────────────────
  const startTick = useCallback((startISO: string): void => {
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      const now = Date.now()
      const start = new Date(startISO).getTime()
      const sec = Math.floor((now - start) / 1000)
      setElapsed(sec)
      // Countdown to next alerts based on intervals
      const sec25 = 25 * 60
      const sec60 = 60 * 60
      setNext25(sec25 - (sec % sec25))
      setNext60(sec60 - (sec % sec60))
    }, 1000)
  }, [])

  // ── Alert intervals ─────────────────────────────────────────────────────────
  const startAlerts = useCallback((startISO: string): void => {
    if (alert25Ref.current) clearInterval(alert25Ref.current)
    if (alert60Ref.current) clearInterval(alert60Ref.current)

    const INTERVAL_25 = 25 * 60 * 1000
    const INTERVAL_60 = 60 * 60 * 1000

    // Calculate offset so alerts fire from workStart, not from now
    const startMs = new Date(startISO).getTime()
    const elapsed = Date.now() - startMs

    const offset25 = INTERVAL_25 - (elapsed % INTERVAL_25)
    const offset60 = INTERVAL_60 - (elapsed % INTERVAL_60)

    // 25-min alert
    const fire25 = (): void => {
      playPauseChime('short')
      sendNotif(ALERT_25.title, ALERT_25.body)
      setPauses(prev => {
        const next: Pause[] = [...prev, { at: new Date().toISOString(), type: '25' as PauseType }]
        pausesRef.current = next
        persist(startISO, null, next)
        return next
      })
    }
    // 60-min alert
    const fire60 = (): void => {
      playPauseChime('long')
      sendNotif(ALERT_60.title, ALERT_60.body)
      setPauses(prev => {
        const next: Pause[] = [...prev, { at: new Date().toISOString(), type: '60' as PauseType }]
        pausesRef.current = next
        persist(startISO, null, next)
        return next
      })
    }

    // First fire offset, then repeat
    const t25 = setTimeout(() => {
      fire25()
      alert25Ref.current = setInterval(fire25, INTERVAL_25)
    }, offset25)

    const t60 = setTimeout(() => {
      fire60()
      alert60Ref.current = setInterval(fire60, INTERVAL_60)
    }, offset60)

    // Store timeout IDs so we can clear them on checkout
    alert25Ref._initTimeout = t25
    alert60Ref._initTimeout = t60
  }, [persist])

  // ── Stop all timers ─────────────────────────────────────────────────────────
  const stopAll = useCallback((): void => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (alert25Ref.current) clearInterval(alert25Ref.current)
    if (alert60Ref.current) clearInterval(alert60Ref.current)
    if (alert25Ref._initTimeout) clearTimeout(alert25Ref._initTimeout)
    if (alert60Ref._initTimeout) clearTimeout(alert60Ref._initTimeout)
    tickRef.current = null
    alert25Ref.current = null
    alert60Ref.current = null
    setNext25(null)
    setNext60(null)
  }, [])

  // ── Load state from localStorage on mount ──────────────────────────────────
  useEffect(() => {
    const saved = lsLoad(today)
    if (saved?.workStart) {
      setWorkStart(saved.workStart)
      setWorkEnd(saved.workEnd || null)
      setPauses(saved.pauses || [])
      // If still clocked in (no workEnd), resume timers
      if (!saved.workEnd) {
        startTick(saved.workStart)
        startAlerts(saved.workStart)
      } else {
        // Already clocked out — compute final elapsed
        const sec = Math.floor(
          (new Date(saved.workEnd).getTime() - new Date(saved.workStart).getTime()) / 1000
        )
        setElapsed(sec)
      }
    }
    return () => stopAll()
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check-in ────────────────────────────────────────────────────────────────
  const checkIn = useCallback(async (): Promise<void> => {
    await requestNotifPermission()
    const now = new Date().toISOString()
    setWorkStart(now)
    setWorkEnd(null)
    setPauses([])
    persist(now, null, [])
    startTick(now)
    startAlerts(now)
  }, [persist, startTick, startAlerts])

  // ── Check-out ───────────────────────────────────────────────────────────────
  const checkOut = useCallback((): void => {
    const now = new Date().toISOString()
    setWorkEnd(now)
    stopAll()
    persist(workStart, now, pausesRef.current)
  }, [stopAll, persist, workStart])

  // ── Derived state ───────────────────────────────────────────────────────────
  const isClockedIn  = !!workStart && !workEnd
  const isClockedOut = !!workStart && !!workEnd

  // Format seconds to HH:MM:SS
  const formatTime = (sec: number | null): string => {
    if (sec == null || sec < 0) return '--:--'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }

  return {
    // State
    workStart, workEnd, pauses, elapsed, next25, next60,
    isClockedIn, isClockedOut,
    // Actions
    checkIn, checkOut,
    // Helpers
    formatTime,
  }
}
