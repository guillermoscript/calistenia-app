/**
 * Difficulty inference utility.
 * Infers program difficulty from exercise names.
 */

import type { DifficultyLevel } from '../types'

const ADVANCED_KEYWORDS = [
  'one-arm', 'one arm', 'muscle-up', 'muscle up', 'planche', 'front lever',
  'back lever', 'human flag', 'hspu', 'handstand push', 'ring dip',
  'front lever completo', 'one-arm pull',
]

const INTERMEDIATE_KEYWORDS = [
  'pullup_strict', 'pull-up estricto', 'diamond', 'bulgarian', 'pistol',
  'nordic', 'archer', 'typewriter', 'weighted', 'mochila', 'l-sit',
  'handstand', 'pike elevated', 'dips paralelas',
]

interface ExerciseLike {
  id?: string
  name: string
  note?: string
}

export function inferDifficulty(exercises: ExerciseLike[]): DifficultyLevel {
  const allText = exercises
    .map(e => `${e.id || ''} ${e.name} ${e.note || ''}`.toLowerCase())
    .join(' ')

  if (ADVANCED_KEYWORDS.some(kw => allText.includes(kw))) {
    return 'advanced'
  }

  if (INTERMEDIATE_KEYWORDS.some(kw => allText.includes(kw))) {
    return 'intermediate'
  }

  return 'beginner'
}

export const DIFFICULTY_COLORS: Record<DifficultyLevel, { text: string; bg: string; border: string }> = {
  beginner:     { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  intermediate: { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  advanced:     { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
}
