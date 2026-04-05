/**
 * Shared style tokens — semantic color mappings used across the app.
 *
 * Import from here instead of defining local constants per-file.
 */
import type { DayType, Priority } from '../types'

// ── Phase colors ────────────────────────────────────────────────────────────
export const PHASE_COLORS: Record<number, { border: string; text: string; bg: string; badge: string }> = {
  1: { border: 'border-l-lime',      text: 'text-lime',      bg: 'bg-lime/10',      badge: 'border-lime/30 text-lime bg-lime/10' },
  2: { border: 'border-l-sky-500',   text: 'text-sky-500',   bg: 'bg-sky-500/10',   badge: 'border-sky-500/30 text-sky-500 bg-sky-500/10' },
  3: { border: 'border-l-pink-500',  text: 'text-pink-500',  bg: 'bg-pink-500/10',  badge: 'border-pink-500/30 text-pink-500 bg-pink-500/10' },
  4: { border: 'border-l-amber-400', text: 'text-amber-400', bg: 'bg-amber-400/10', badge: 'border-amber-400/30 text-amber-400 bg-amber-400/10' },
}

// ── Day type colors (workout categories) ────────────────────────────────────
export const DAY_TYPE_COLORS: Record<DayType, { badge: string; border: string }> = {
  push:   { badge: 'border-lime/60 text-lime bg-lime/5',            border: 'border-l-lime' },
  pull:   { badge: 'border-sky-500/60 text-sky-600 bg-sky-500/5',   border: 'border-l-sky-500' },
  lumbar: { badge: 'border-red-500/60 text-red-500 bg-red-500/5',   border: 'border-l-red-500' },
  legs:   { badge: 'border-pink-500/60 text-pink-500 bg-pink-500/5', border: 'border-l-pink-500' },
  full:   { badge: 'border-amber-400/60 text-amber-500 bg-amber-400/5', border: 'border-l-amber-400' },
  rest:   { badge: 'border-border text-muted-foreground bg-transparent', border: 'border-l-border' },
  cardio: { badge: 'border-emerald-400/60 text-emerald-400 bg-emerald-400/5', border: 'border-l-emerald-400' },
  yoga:   { badge: 'border-violet-400/60 text-violet-400 bg-violet-400/5', border: 'border-l-violet-400' },
  circuit: { badge: 'border-orange-500/60 text-orange-500 bg-orange-500/5', border: 'border-l-orange-500' },
}

// ── Priority colors ─────────────────────────────────────────────────────────
export const PRIORITY_COLORS: Record<Priority, { stripe: string; border: string; text: string; badge: string }> = {
  high: { stripe: 'bg-red-500',   border: 'border-l-red-500',   text: 'text-red-500',   badge: 'text-red-500 border-red-500/30' },
  med:  { stripe: 'bg-amber-400', border: 'border-l-amber-400', text: 'text-amber-400', badge: 'text-amber-400 border-amber-400/30' },
  low:  { stripe: 'bg-sky-500',   border: 'border-l-sky-500',   text: 'text-sky-500',   badge: 'text-sky-500 border-sky-500/30' },
}

// ── Cardio activity types ─────────────────────────────────────────────────
export const CARDIO_ACTIVITY: Record<string, { icon: string; color: string; bg: string }> = {
  running: { icon: '🏃', color: 'text-lime',      bg: 'bg-lime/10 border-lime/30' },
  walking: { icon: '🚶', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
  cycling: { icon: '🚴', color: 'text-sky-500',   bg: 'bg-sky-500/10 border-sky-500/30' },
}

// ── Meal type colors ────────────────────────────────────────────────────────
export const MEAL_TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  desayuno: { color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
  almuerzo: { color: 'text-sky-500',   bg: 'bg-sky-500/10 border-sky-500/30' },
  cena:     { color: 'text-pink-500',  bg: 'bg-pink-500/10 border-pink-500/30' },
  snack:    { color: 'text-lime',      bg: 'bg-lime/10 border-lime/30' },
}
