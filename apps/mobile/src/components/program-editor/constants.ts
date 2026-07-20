/**
 * Constantes compartidas del editor de programas nativo (#223) —
 * espejo de apps/web/src/pages/ProgramEditorPage.tsx:21-57.
 */
import type { CardioActivityType } from '@calistenia/core/types'

export const STEP_LABEL_KEYS = [
  'programEditor.stepInfo',
  'programEditor.stepPhases',
  'programEditor.stepDays',
  'programEditor.stepExercises',
]

export const COLOR_SWATCHES = [
  { name: 'lime',    color: '#c8f542', bg: 'rgba(200,245,66,0.08)' },
  { name: 'sky',     color: '#42c8f5', bg: 'rgba(66,200,245,0.08)' },
  { name: 'pink',    color: '#f542c8', bg: 'rgba(245,66,200,0.08)' },
  { name: 'amber',   color: '#f5c842', bg: 'rgba(245,200,66,0.08)' },
  { name: 'red',     color: '#f54242', bg: 'rgba(245,66,66,0.08)' },
  { name: 'emerald', color: '#34d399', bg: 'rgba(52,211,153,0.08)' },
]

export const DAY_TYPE_OPTIONS = [
  { value: 'push',    labelKey: 'dayType.push' },
  { value: 'pull',    labelKey: 'dayType.pull' },
  { value: 'legs',    labelKey: 'dayType.legs' },
  { value: 'core',    labelKey: 'dayType.core' },
  { value: 'lumbar',  labelKey: 'dayType.lumbar' },
  { value: 'full',    labelKey: 'dayType.full' },
  { value: 'cardio',  labelKey: 'dayType.cardio' },
  { value: 'yoga',    labelKey: 'dayType.yoga' },
  { value: 'circuit', labelKey: 'dayType.circuit' },
  { value: 'rest',    labelKey: 'dayType.rest' },
]

export const CARDIO_TYPE_OPTIONS: { value: CardioActivityType; labelKey: string }[] = [
  { value: 'running', labelKey: 'cardio.running' },
  { value: 'walking', labelKey: 'cardio.walking' },
  { value: 'cycling', labelKey: 'cardio.cycling' },
]

export const PRIORITY_OPTIONS: { value: 'high' | 'med' | 'low'; i18nKey: string; className: string }[] = [
  { value: 'high', i18nKey: 'priority.high', className: 'text-red-400' },
  { value: 'med',  i18nKey: 'priority.med',  className: 'text-amber-400' },
  { value: 'low',  i18nKey: 'priority.low',  className: 'text-emerald-400' },
]

export const DAY_IDS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
