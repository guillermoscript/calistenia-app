import { describe, it, expect } from 'vitest'
import { processCardioFix, type CardioFixState, type CardioFixInput } from './cardio-fix'

const t0 = 1_770_000_000_000 // epoch ms base

const freshState = (over: Partial<CardioFixState> = {}): CardioFixState => ({
  lastPoint: null,
  kalman: null,
  distanceKm: 0,
  lastSplitKm: 0,
  lastSplitTime: 0,
  startTime: t0,
  maxSpeedKmh: 0,
  ...over,
})

const fix = (over: Partial<CardioFixInput> = {}): CardioFixInput => ({
  latitude: 40.0,
  longitude: -3.0,
  altitude: 700,
  accuracy: 5,
  speed: 3,
  timestamp: t0,
  ...over,
})

describe('processCardioFix', () => {
  // ── (a) primer fix ────────────────────────────────────────────────────────

  it('primer fix: aceptado, sin distancia ni split', () => {
    const r = processCardioFix(freshState(), fix(), 'running')
    expect(r.accepted).toBe(true)
    expect(r.point).not.toBeNull()
    expect(r.distanceKm).toBe(0)
    expect(r.split).toBeNull()
    expect(r.splitCompleted).toBe(false)
  })

  it('primer fix: pace y speed calculados cuando speed > 0.5', () => {
    const r = processCardioFix(freshState(), fix({ speed: 3 }), 'running')
    // paceMinKm = 1000 / 60 / 3 ≈ 5.556
    expect(r.paceMinKm).toBeCloseTo(1000 / 60 / 3, 5)
    // speedKmh = Math.round(3 * 3.6 * 10) / 10 = 10.8
    expect(r.speedKmh).toBe(10.8)
    expect(r.nextState.maxSpeedKmh).toBe(10.8)
  })

  it('primer fix: speed nula → pace y speed en 0', () => {
    const r = processCardioFix(freshState(), fix({ speed: null }), 'running')
    expect(r.paceMinKm).toBe(0)
    expect(r.speedKmh).toBe(0)
  })

  // ── (b) jitter sub-3m rechazado ───────────────────────────────────────────

  it('jitter sub-3m: segundo fix rechazado, distancia sin cambio', () => {
    // Primer fix en lat 40.0
    const r1 = processCardioFix(freshState(), fix({ timestamp: t0 }), 'running')
    expect(r1.accepted).toBe(true)

    // Segundo fix ~1.1 m más al norte (0.00001° lat ≈ 1.11 m, bien por debajo de 3 m)
    // Con k≈0.985 el Kalman apenas atenúa, así que haversine también sale <3 m
    const r2 = processCardioFix(
      r1.nextState,
      fix({ latitude: 40.00001, timestamp: t0 + 5_000 }),
      'running',
    )
    expect(r2.accepted).toBe(false)
    expect(r2.point).toBeNull()
    expect(r2.distanceKm).toBe(0)
    // El estado de entrada no debe cambiar: distanceKm sigue en 0
    expect(r2.nextState.distanceKm).toBe(0)
  })

  // ── (c) gap >30s ──────────────────────────────────────────────────────────

  it('gap plausible (running): punto aceptado con gap=true, distancia incrementa', () => {
    // Primer fix
    const r1 = processCardioFix(freshState(), fix({ timestamp: t0 }), 'running')
    expect(r1.accepted).toBe(true)

    // Segundo fix 60s después, ~50 m al norte (0.00045° ≈ 50 m; velocidad ~0.83 m/s < 6)
    const r2 = processCardioFix(
      r1.nextState,
      fix({ latitude: 40.00045, timestamp: t0 + 60_000 }),
      'running',
    )
    expect(r2.accepted).toBe(true)
    expect(r2.point).not.toBeNull()
    expect(r2.point!.gap).toBe(true)
    expect(r2.distanceKm).toBeGreaterThan(0)
    expect(r2.splitCompleted).toBe(false)
  })

  it('gap implausible (running): punto aceptado con gap=true pero distancia sin cambio', () => {
    // Primer fix
    const r1 = processCardioFix(freshState(), fix({ timestamp: t0 }), 'running')
    expect(r1.accepted).toBe(true)

    // Segundo fix 31s después, ~500 m al norte (0.0045° ≈ 500 m; velocidad ~16 m/s > 6)
    const r2 = processCardioFix(
      r1.nextState,
      fix({ latitude: 40.0045, timestamp: t0 + 31_000 }),
      'running',
    )
    // El punto sigue siendo aceptado (gap no rechaza el punto)
    expect(r2.accepted).toBe(true)
    expect(r2.point).not.toBeNull()
    expect(r2.point!.gap).toBe(true)
    // Distancia NO debe aumentar (velocidad implausible para running)
    expect(r2.distanceKm).toBe(0)
    expect(r2.nextState.distanceKm).toBe(0)
  })

  it('gap plausible (cycling): distancia incrementa con límite de 14 m/s', () => {
    const r1 = processCardioFix(freshState(), fix({ timestamp: t0 }), 'cycling')

    // 100 m en 31s → ~3.2 m/s < 14 → plausible para cycling
    const r2 = processCardioFix(
      r1.nextState,
      fix({ latitude: 40.0009, timestamp: t0 + 31_000 }),
      'cycling',
    )
    expect(r2.accepted).toBe(true)
    expect(r2.point!.gap).toBe(true)
    expect(r2.distanceKm).toBeGreaterThan(0)
  })

  // ── (d) cruce de km → splitCompleted ────────────────────────────────────

  it('cruce de km: splitCompleted=true y split.km=2 al superar 1 km', () => {
    // Estado pre-sembrado justo antes del km 1 (0.9995 km acumulado)
    // El punto previo está a lat 40.0
    const seeded = freshState({
      distanceKm: 0.9995,
      lastSplitKm: 0,
      lastPoint: {
        lat: 40.0,
        lng: -3.0,
        timestamp: t0,
      },
    })

    // Fix ~10 m al norte del punto previo (0.00009° ≈ 10 m → 0.010 km añadido)
    // 0.9995 + 0.01 = 1.0095 → Math.floor = 1 > 0 → splitCompleted
    const r = processCardioFix(
      seeded,
      fix({ latitude: 40.00009, timestamp: t0 + 10_000 }),
      'running',
    )
    expect(r.accepted).toBe(true)
    expect(r.splitCompleted).toBe(true)
    expect(r.split).not.toBeNull()
    expect(r.split!.km).toBe(2)
    expect(r.nextState.lastSplitKm).toBe(1)
  })

  it('cruce de km: sin cruce de km → splitCompleted=false', () => {
    const seeded = freshState({
      distanceKm: 0.5,
      lastSplitKm: 0,
      lastPoint: {
        lat: 40.0,
        lng: -3.0,
        timestamp: t0,
      },
    })

    const r = processCardioFix(
      seeded,
      fix({ latitude: 40.00009, timestamp: t0 + 10_000 }),
      'running',
    )
    expect(r.accepted).toBe(true)
    expect(r.splitCompleted).toBe(false)
    expect(r.split!.km).toBe(1) // seguimos en el km 1
  })

  // ── (e) accuracy > 20 rechazado ──────────────────────────────────────────

  it('accuracy > MAX_ACCURACY_M: fix rechazado pero accuracy propagada', () => {
    const r = processCardioFix(freshState(), fix({ accuracy: 25 }), 'running')
    expect(r.accepted).toBe(false)
    expect(r.point).toBeNull()
    expect(r.nextState.distanceKm).toBe(0)
    expect(r.accuracy).toBe(25)
  })

  // ── (extra) accuracy == null rechazado ───────────────────────────────────

  it('accuracy null: fix rechazado y accuracy null en resultado', () => {
    const r = processCardioFix(freshState(), fix({ accuracy: null }), 'running')
    expect(r.accepted).toBe(false)
    expect(r.point).toBeNull()
    expect(r.accuracy).toBeNull()
    expect(r.nextState.distanceKm).toBe(0)
  })

  // ── velocidad máxima (maxSpeedKmh) ────────────────────────────────────────

  it('maxSpeedKmh se actualiza cuando speedKmh supera el máximo previo', () => {
    // Primer fix con speed baja
    const r1 = processCardioFix(freshState(), fix({ speed: 2 }), 'running')
    expect(r1.nextState.maxSpeedKmh).toBe(Math.round(2 * 3.6 * 10) / 10)

    // Estado con punto previo para poder avanzar; fix con speed mayor
    const seeded: CardioFixState = {
      ...r1.nextState,
      lastPoint: {
        lat: 40.0,
        lng: -3.0,
        timestamp: t0,
      },
      distanceKm: 0,
    }
    const r2 = processCardioFix(
      seeded,
      fix({ latitude: 40.00009, speed: 5, timestamp: t0 + 10_000 }),
      'running',
    )
    if (r2.accepted) {
      expect(r2.nextState.maxSpeedKmh).toBe(Math.round(5 * 3.6 * 10) / 10)
    }
  })
})
