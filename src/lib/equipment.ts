/**
 * Equipment catalog and detection utility.
 * Labels come from i18n — use t(getEquipmentLabelKey(id)) in consumers.
 */

export const EQUIPMENT_CATALOG: { id: string; icon: string }[] = [
  { id: 'ninguno', icon: '🏋️' },
  { id: 'barra_dominadas', icon: '🔩' },
  { id: 'paralelas', icon: '🪜' },
  { id: 'anillas', icon: '⭕' },
  { id: 'banda_elastica', icon: '🔗' },
  { id: 'lastre', icon: '🎒' },
  { id: 'fitball', icon: '🟡' },
  { id: 'rueda_abdominal', icon: '☸️' },
  { id: 'trx', icon: '🪢' },
  { id: 'banco', icon: '🪑' },
  { id: 'kettlebell', icon: '🔔' },
  { id: 'pared', icon: '🧱' },
  { id: 'toalla', icon: '🧻' },
  { id: 'escalon', icon: '📦' },
]

const EQUIPMENT_KEYWORDS: Record<string, string[]> = {
  'barra_dominadas': ['barra', 'pull-up', 'pull up', 'dominada', 'muscle-up', 'muscle up', 'front lever', 'back lever', 'typewriter', 'hollow-to-arch', 'hollow arch'],
  'banco': ['silla', 'banco', 'chair', 'bench', 'dips', 'elevated', 'step-up', 'step up', 'paralelas'],
  'banda_elastica': ['banda', 'band', 'elastica', 'asistida'],
  'pared': ['pared', 'wall', 'handstand contra', 'wall sit'],
  'anillas': ['anillas', 'rings', 'ring dip'],
  'lastre': ['mochila', 'peso', 'weighted', 'con peso', 'con 2-5kg', 'con 5-10kg'],
  'toalla': ['toalla', 'towel'],
  'escalon': ['escalon', 'step-up', 'step up', 'box jump'],
}

export function detectEquipment(exercise: { name: string; note: string }): string[] {
  const text = `${exercise.name} ${exercise.note}`.toLowerCase()
  const found: string[] = []

  for (const [equipmentId, keywords] of Object.entries(EQUIPMENT_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      found.push(equipmentId)
    }
  }

  return found.length > 0 ? found : ['ninguno']
}

export function getExerciseEquipment(exercise: { name: string; note: string; equipment?: string[] }): string[] {
  if (exercise.equipment && exercise.equipment.length > 0) {
    return exercise.equipment
  }
  return detectEquipment(exercise)
}

export function getEquipmentLabelKey(id: string): string {
  return `equipment.${id}`
}
