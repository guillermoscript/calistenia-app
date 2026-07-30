/**
 * Registro de funciones públicas.
 * Cada entrada tiene su propia página en /features/:slug y se enlaza desde la landing.
 * Los textos viven en i18n bajo `feature.<slug>.*`.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { Dumbbell, Flame, LineChart, Route, ShoppingBasket, Timer, Trophy, Users, WifiOff, type LucideIcon } from 'lucide-react'
import { BeyondVisual, LibraryPanel, PantryPanel, ProgressPanel } from '../components/landing/panels'

export interface FeatureDef {
  slug: string
  icon: LucideIcon
  /** Panel ilustrativo del hero. Lo usa la plantilla de fallback; el índice solo usa `icon`. */
  Visual: ComponentType
  /** Otras funciones que se sugieren al final de la página. */
  related: string[]
  /**
   * Página propia de la función (épica #279). Si existe, `FeaturePage` la
   * renderiza en lugar de la plantilla y `blocks`/`faqs` sobran.
   * Solo `lazy()`: este registro entra en el bundle de la landing.
   */
  Page?: LazyExoticComponent<ComponentType>
  /** Número de bloques "qué incluye" definidos en i18n. Solo para la plantilla. */
  blocks?: number
  /** Número de preguntas frecuentes definidas en i18n. Solo para la plantilla. */
  faqs?: number
}

const Beyond = (index: number) => function BeyondPanel() { return <BeyondVisual index={index} /> }

export const FEATURES: FeatureDef[] = [
  { slug: 'training', icon: Dumbbell, Visual: LibraryPanel, related: ['progress', 'circuits', 'offline'], Page: lazy(() => import('../pages/features/TrainingPage')) },
  { slug: 'nutrition', icon: ShoppingBasket, Visual: PantryPanel, related: ['progress', 'training', 'community'], Page: lazy(() => import('../pages/features/NutritionPage')) },
  { slug: 'progress', icon: LineChart, Visual: ProgressPanel, related: ['training', 'nutrition', 'community'], blocks: 4, faqs: 3 },
  { slug: 'cardio', icon: Route, Visual: Beyond(0), related: ['races', 'progress', 'offline'], Page: lazy(() => import('../pages/features/CardioPage')) },
  { slug: 'circuits', icon: Timer, Visual: Beyond(1), related: ['training', 'cardio', 'progress'], blocks: 4, faqs: 3 },
  { slug: 'races', icon: Trophy, Visual: Beyond(2), related: ['cardio', 'challenges', 'community'], Page: lazy(() => import('../pages/features/RacesPage')) },
  { slug: 'challenges', icon: Flame, Visual: Beyond(3), related: ['community', 'progress', 'races'], blocks: 4, faqs: 3 },
  { slug: 'community', icon: Users, Visual: Beyond(4), related: ['challenges', 'races', 'progress'], Page: lazy(() => import('../pages/features/CommunityPage')) },
  { slug: 'offline', icon: WifiOff, Visual: Beyond(5), related: ['training', 'cardio', 'progress'], blocks: 4, faqs: 3 },
]

export function getFeature(slug?: string): FeatureDef | undefined {
  return FEATURES.find(f => f.slug === slug)
}
