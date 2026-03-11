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

const TODAY = () => new Date().toISOString().split('T')[0]
const LS_KEY = (date) => `calistenia_workday_${date}`

// ─── localStorage helpers ─────────────────────────────────────────────────────
function lsLoad(date) {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY(date)) || 'null')
  } catch {
    return null
  }
}
function lsSave(date, data) {
  localStorage.setItem(LS_KEY(date), JSON.stringify(data))
}

// ─── Audio helpers ────────────────────────────────────────────────────────────
// Reuses the same AudioContext pattern from RestTimer.jsx / Timer.jsx
let _audioCtx = null
function getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _audioCtx
}

function playBeep(freq = 880, duration = 0.18, vol = 0.25) {
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

function playPauseChime(type = 'short') {
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
async function requestNotifPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function sendNotif(title, body) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
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

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWorkDay() {
  const today = TODAY()

  // State — loaded from localStorage on mount
  const [workStart, setWorkStart] = useState(null)   // ISO string or null
  const [workEnd, setWorkEnd]     = useState(null)   // ISO string or null
  const [pauses, setPauses]       = useState([])     // [{ at: ISO, type: '25'|'60' }]
  const [elapsed, setElapsed]     = useState(0)      // seconds since workStart
  const [next25, setNext25]       = useState(null)   // seconds until next 25-min alert
  const [next60, setNext60]       = useState(null)   // seconds until next 60-min alert

  // Refs for intervals — stable refs avoid stale closures
  const tickRef    = useRef(null)
  const alert25Ref = useRef(null)
  const alert60Ref = useRef(null)
  const pausesRef  = useRef(pauses) // keep a ref to write into interval callback
  useEffect(() => { pausesRef.current = pauses }, [pauses])

  // ── Persist helper ──────────────────────────────────────────────────────────
  const persist = useCallback((ws, we, ps) => {
    lsSave(today, { workStart: ws, workEnd: we, pauses: ps, date: today })
  }, [today])

  // ── Tick (every second) — updates elapsed + countdowns ─────────────────────
  const startTick = useCallback((startISO) => {
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
  const startAlerts = useCallback((startISO) => {
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
    const fire25 = () => {
      playPauseChime('short')
      sendNotif(ALERT_25.title, ALERT_25.body)
      setPauses(prev => {
        const next = [...prev, { at: new Date().toISOString(), type: '25' }]
        pausesRef.current = next
        persist(startISO, null, next)
        return next
      })
    }
    // 60-min alert
    const fire60 = () => {
      playPauseChime('long')
      sendNotif(ALERT_60.title, ALERT_60.body)
      setPauses(prev => {
        const next = [...prev, { at: new Date().toISOString(), type: '60' }]
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
  const stopAll = useCallback(() => {
    clearInterval(tickRef.current)
    clearInterval(alert25Ref.current)
    clearInterval(alert60Ref.current)
    clearTimeout(alert25Ref._initTimeout)
    clearTimeout(alert60Ref._initTimeout)
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
  const checkIn = useCallback(async () => {
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
  const checkOut = useCallback(() => {
    const now = new Date().toISOString()
    setWorkEnd(now)
    stopAll()
    persist(workStart, now, pausesRef.current)
  }, [stopAll, persist, workStart])

  // ── Derived state ───────────────────────────────────────────────────────────
  const isClockedIn  = !!workStart && !workEnd
  const isClockedOut = !!workStart && !!workEnd

  // Format seconds to HH:MM:SS
  const formatTime = (sec) => {
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
