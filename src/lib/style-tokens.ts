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
}

// ── Priority colors ─────────────────────────────────────────────────────────
export const PRIORITY_COLORS: Record<Priority, { stripe: string; border: string; text: string }> = {
  high: { stripe: 'bg-red-500',   border: 'border-l-red-500',   text: 'text-red-500' },
  med:  { stripe: 'bg-amber-400', border: 'border-l-amber-400', text: 'text-amber-400' },
  low:  { stripe: 'bg-sky-500',   border: 'border-l-sky-500',   text: 'text-sky-500' },
}

// ── Cardio activity types ─────────────────────────────────────────────────
export const CARDIO_ACTIVITY: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  running: { label: 'Carrera',  icon: '🏃', color: 'text-lime',      bg: 'bg-lime/10 border-lime/30' },
  walking: { label: 'Caminata', icon: '🚶', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
  cycling: { label: 'Ciclismo', icon: '🚴', color: 'text-sky-500',   bg: 'bg-sky-500/10 border-sky-500/30' },
}

// ── Meal type colors ────────────────────────────────────────────────────────
export const MEAL_TYPE_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  desayuno: { label: 'Desayuno', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
  almuerzo: { label: 'Almuerzo', color: 'text-sky-500',   bg: 'bg-sky-500/10 border-sky-500/30' },
  cena:     { label: 'Cena',     color: 'text-pink-500',  bg: 'bg-pink-500/10 border-pink-500/30' },
  snack:    { label: 'Snack',    color: 'text-lime',      bg: 'bg-lime/10 border-lime/30' },
}
