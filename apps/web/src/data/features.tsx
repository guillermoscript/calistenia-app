/**
 * Registro de funciones públicas.
 * Cada entrada tiene su propia página en /features/:slug y se enlaza desde la landing.
 * Los textos viven en i18n bajo `feature.<slug>.*`.
 */
import type { ComponentType } from 'react'
import { Dumbbell, Flame, LineChart, Route, ShoppingBasket, Timer, Trophy, Users, WifiOff, type LucideIcon } from 'lucide-react'
import { BeyondVisual, LibraryPanel, PantryPanel, ProgressPanel } from '../components/landing/panels'

export interface FeatureDef {
  slug: string
  icon: LucideIcon
  /** Panel ilustrativo del hero de la página. */
  Visual: ComponentType
  /** Otras funciones que se sugieren al final de la página. */
  related: string[]
  /** Número de bloques "qué incluye" definidos en i18n. */
  blocks: number
  /** Número de preguntas frecuentes definidas en i18n. */
  faqs: number
}

const Beyond = (index: number) => function BeyondPanel() { return <BeyondVisual index={index} /> }

export const FEATURES: FeatureDef[] = [
  { slug: 'training', icon: Dumbbell, Visual: LibraryPanel, related: ['progress', 'circuits', 'offline'], blocks: 4, faqs: 3 },
  { slug: 'nutrition', icon: ShoppingBasket, Visual: PantryPanel, related: ['progress', 'training', 'community'], blocks: 4, faqs: 3 },
  { slug: 'progress', icon: LineChart, Visual: ProgressPanel, related: ['training', 'nutrition', 'community'], blocks: 4, faqs: 3 },
  { slug: 'cardio', icon: Route, Visual: Beyond(0), related: ['races', 'progress', 'offline'], blocks: 4, faqs: 3 },
  { slug: 'circuits', icon: Timer, Visual: Beyond(1), related: ['training', 'cardio', 'progress'], blocks: 4, faqs: 3 },
  { slug: 'races', icon: Trophy, Visual: Beyond(2), related: ['cardio', 'challenges', 'community'], blocks: 4, faqs: 3 },
  { slug: 'challenges', icon: Flame, Visual: Beyond(3), related: ['community', 'progress', 'races'], blocks: 4, faqs: 3 },
  { slug: 'community', icon: Users, Visual: Beyond(4), related: ['challenges', 'races', 'progress'], blocks: 4, faqs: 3 },
  { slug: 'offline', icon: WifiOff, Visual: Beyond(5), related: ['training', 'cardio', 'progress'], blocks: 4, faqs: 3 },
]

export function getFeature(slug?: string): FeatureDef | undefined {
  return FEATURES.find(f => f.slug === slug)
}
