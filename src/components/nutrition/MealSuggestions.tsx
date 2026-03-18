import { useEffect, useState } from 'react'
import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'
import { pb } from '../../lib/pocketbase'

interface MealSuggestionsProps {
  remaining: { calories: number; protein: number; carbs: number; fat: number }
}

interface CatalogFood {
  name: string
  portionLabel: string
  protein: number
  carbs: number
  fat: number
  calories: number
}

// Hardcoded fallback when catalog is empty
const FALLBACK: Record<'proteinas' | 'carbohidratos' | 'grasas', string> = {
  proteinas: 'pechuga de pollo (31g/100g), huevos (13g/2 unid), atún en lata (26g/lata), yogur griego (10g/150g)',
  carbohidratos: 'arroz (28g/100g cocido), avena (66g/100g), pan integral (49g/100g), banana (23g/unid)',
  grasas: 'aguacate (15g/100g), aceite de oliva (14g/cda), almendras (14g/30g), maní (14g/30g)',
}

async function fetchTopFoodsByCategory(category: string, limit = 4): Promise<CatalogFood[]> {
  try {
    const res = await pb.collection('foods').getList(1, limit, {
      filter: pb.filter('category.slug = {:cat}', { cat: category }),
      sort: '-calories',
      expand: 'category',
    })
    return res.items.map((r: any) => ({
      name: r.name_display,
      portionLabel: r.portion || '100g',
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      calories: r.calories,
    }))
  } catch {
    return []
  }
}

function formatCatalogFoods(foods: CatalogFood[], macro: 'protein' | 'carbs' | 'fat'): string {
  return foods.map(f => `${f.name} (${f[macro]}g/${f.portionLabel})`).join(', ')
}

export default function MealSuggestions({ remaining }: MealSuggestionsProps) {
  const [proteinFoods, setProteinFoods] = useState<CatalogFood[]>([])
  const [carbFoods, setCarbFoods] = useState<CatalogFood[]>([])
  const [fatFoods, setFatFoods] = useState<CatalogFood[]>([])

  const needsProtein = remaining.protein > 20
  const needsCarbs = remaining.carbs > 30
  const needsFat = remaining.fat > 15

  useEffect(() => {
    if (needsProtein) fetchTopFoodsByCategory('proteinas').then(setProteinFoods)
    if (needsCarbs) fetchTopFoodsByCategory('carbohidratos').then(setCarbFoods)
    if (needsFat) fetchTopFoodsByCategory('grasas').then(setFatFoods)
  }, [needsProtein, needsCarbs, needsFat])

  const suggestions: Array<{
    icon: string; title: string; description: string; accent: string; border: string
  }> = []

  // Over-consumption warnings
  const overItems: string[] = []
  if (remaining.calories < 0) overItems.push(`${Math.abs(Math.round(remaining.calories))} kcal`)
  if (remaining.protein < 0) overItems.push(`${Math.abs(Math.round(remaining.protein))}g proteína`)
  if (remaining.carbs < 0) overItems.push(`${Math.abs(Math.round(remaining.carbs))}g carbos`)
  if (remaining.fat < 0) overItems.push(`${Math.abs(Math.round(remaining.fat))}g grasa`)
  if (overItems.length) {
    suggestions.push({
      icon: '⚠️',
      title: 'Exceso detectado',
      description: `Superaste tu objetivo en: ${overItems.join(', ')}. Considera ajustar tu próxima comida.`,
      accent: 'text-amber-400',
      border: 'border-l-amber-400',
    })
  }

  // Almost done
  if (remaining.calories < 200 && remaining.calories >= 0) {
    suggestions.push({
      icon: '🎯',
      title: 'Casi completas tu objetivo',
      description: `Solo te faltan ${Math.round(remaining.calories)} kcal. Un snack ligero como una fruta o yogur sería ideal.`,
      accent: 'text-emerald-500',
      border: 'border-l-emerald-500',
    })
  }

  // Protein
  if (needsProtein) {
    const desc = proteinFoods.length
      ? `Opciones del catálogo: ${formatCatalogFoods(proteinFoods, 'protein')}.`
      : `Opciones: ${FALLBACK.proteinas}.`
    suggestions.push({
      icon: '🥩',
      title: `Te faltan ${Math.round(remaining.protein)}g de proteína`,
      description: desc,
      accent: 'text-sky-500',
      border: 'border-l-sky-500',
    })
  }

  // Carbs
  if (needsCarbs) {
    const desc = carbFoods.length
      ? `Opciones del catálogo: ${formatCatalogFoods(carbFoods, 'carbs')}.`
      : `Opciones: ${FALLBACK.carbohidratos}.`
    suggestions.push({
      icon: '🍚',
      title: `Te faltan ${Math.round(remaining.carbs)}g de carbohidratos`,
      description: desc,
      accent: 'text-amber-400',
      border: 'border-l-amber-400',
    })
  }

  // Fat
  if (needsFat) {
    const desc = fatFoods.length
      ? `Opciones del catálogo: ${formatCatalogFoods(fatFoods, 'fat')}.`
      : `Opciones: ${FALLBACK.grasas}.`
    suggestions.push({
      icon: '🥑',
      title: `Te faltan ${Math.round(remaining.fat)}g de grasa`,
      description: desc,
      accent: 'text-pink-500',
      border: 'border-l-pink-500',
    })
  }

  if (suggestions.length === 0) return null

  return (
    <div>
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">Sugerencias</div>
      <div className="space-y-3">
        {suggestions.map((s, i) => (
          <Card key={i} className={cn('border-l-[3px]', s.border)}>
            <CardContent className="p-4">
              <div className="flex gap-3">
                <span className="text-xl shrink-0">{s.icon}</span>
                <div>
                  <div className={cn('text-sm font-medium', s.accent)}>{s.title}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.description}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
