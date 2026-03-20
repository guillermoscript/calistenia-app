/**
 * Equipment catalog and detection utility.
 */

export const EQUIPMENT_CATALOG: { id: string; label: string; icon: string }[] = [
  { id: 'ninguno', label: 'Sin equipo', icon: '🏋️' },
  { id: 'barra_dominadas', label: 'Barra de dominadas', icon: '🔩' },
  { id: 'paralelas', label: 'Paralelas', icon: '🪜' },
  { id: 'anillas', label: 'Anillas', icon: '⭕' },
  { id: 'banda_elastica', label: 'Banda elástica', icon: '🔗' },
  { id: 'lastre', label: 'Lastre/Peso', icon: '🎒' },
  { id: 'fitball', label: 'Fitball', icon: '🟡' },
  { id: 'rueda_abdominal', label: 'Rueda abdominal', icon: '☸️' },
  { id: 'trx', label: 'TRX', icon: '🪢' },
  { id: 'banco', label: 'Banco/Silla', icon: '🪑' },
  { id: 'kettlebell', label: 'Kettlebell', icon: '🔔' },
  { id: 'pared', label: 'Pared', icon: '🧱' },
  { id: 'toalla', label: 'Toalla', icon: '🧻' },
  { id: 'escalon', label: 'Escalón', icon: '📦' },
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

export function getEquipmentLabel(id: string): string {
  const item = EQUIPMENT_CATALOG.find(e => e.id === id)
  return item ? item.label : id
}
