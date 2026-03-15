/**
 * Equipment detection utility.
 * Scans exercise name and note fields for equipment keywords.
 */

const EQUIPMENT_KEYWORDS: Record<string, string[]> = {
  'Barra de dominadas': ['barra', 'pull-up', 'pull up', 'dominada', 'muscle-up', 'muscle up', 'front lever', 'back lever', 'typewriter', 'hollow-to-arch', 'hollow arch'],
  'Silla/Banco': ['silla', 'banco', 'chair', 'bench', 'dips', 'elevated', 'step-up', 'step up', 'paralelas'],
  'Banda elastica': ['banda', 'band', 'elastica', 'asistida'],
  'Pared': ['pared', 'wall', 'handstand contra', 'wall sit'],
  'Anillas': ['anillas', 'rings', 'ring dip'],
  'Mochila/Peso': ['mochila', 'peso', 'weighted', 'con peso', 'con 2-5kg', 'con 5-10kg'],
  'Toalla': ['toalla', 'towel'],
  'Escalon': ['escalon', 'step-up', 'step up', 'box jump'],
}

export function detectEquipment(exercise: { name: string; note: string }): string[] {
  const text = `${exercise.name} ${exercise.note}`.toLowerCase()
  const found: string[] = []

  for (const [equipment, keywords] of Object.entries(EQUIPMENT_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      found.push(equipment)
    }
  }

  return found.length > 0 ? found : ['Sin equipo']
}
