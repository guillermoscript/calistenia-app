import { Card, CardContent } from '../ui/card'
import { cn } from '../../lib/utils'

interface MealSuggestionsProps {
  remaining: { calories: number; protein: number; carbs: number; fat: number }
}

interface Suggestion {
  icon: string
  title: string
  description: string
  accent: string
  border: string
}

export default function MealSuggestions({ remaining }: MealSuggestionsProps) {
  const suggestions: Suggestion[] = []

  // Check for over-consumption warnings
  const overCalories = remaining.calories < 0
  const overProtein = remaining.protein < 0
  const overCarbs = remaining.carbs < 0
  const overFat = remaining.fat < 0

  if (overCalories || overProtein || overCarbs || overFat) {
    const overItems: string[] = []
    if (overCalories) overItems.push(`${Math.abs(Math.round(remaining.calories))} kcal`)
    if (overProtein) overItems.push(`${Math.abs(Math.round(remaining.protein))}g proteina`)
    if (overCarbs) overItems.push(`${Math.abs(Math.round(remaining.carbs))}g carbos`)
    if (overFat) overItems.push(`${Math.abs(Math.round(remaining.fat))}g grasa`)

    suggestions.push({
      icon: '⚠️',
      title: 'Exceso detectado',
      description: `Superaste tu objetivo en: ${overItems.join(', ')}. Considera ajustar tu proxima comida.`,
      accent: 'text-amber-400',
      border: 'border-l-amber-400',
    })
  }

  // Almost done
  if (!overCalories && remaining.calories < 200 && remaining.calories >= 0) {
    suggestions.push({
      icon: '🎯',
      title: 'Casi completas tu objetivo',
      description: `Solo te faltan ${Math.round(remaining.calories)} kcal. Un snack ligero como una fruta o yogur seria ideal.`,
      accent: 'text-emerald-500',
      border: 'border-l-emerald-500',
    })
  }

  // Protein suggestions
  if (remaining.protein > 20) {
    suggestions.push({
      icon: '🥩',
      title: `Te faltan ${Math.round(remaining.protein)}g de proteina`,
      description: 'Opciones: pechuga de pollo (31g/100g), huevos (13g/2 unid), atun en lata (26g/lata), yogur griego (10g/150g), queso cottage (11g/100g).',
      accent: 'text-sky-500',
      border: 'border-l-sky-500',
    })
  }

  // Carbs suggestions
  if (remaining.carbs > 30) {
    suggestions.push({
      icon: '🍚',
      title: `Te faltan ${Math.round(remaining.carbs)}g de carbohidratos`,
      description: 'Opciones: arroz (28g/100g cocido), avena (66g/100g), pan integral (49g/100g), banana (23g/unid), batata (20g/100g).',
      accent: 'text-amber-400',
      border: 'border-l-amber-400',
    })
  }

  // Fat suggestions
  if (remaining.fat > 15) {
    suggestions.push({
      icon: '🥑',
      title: `Te faltan ${Math.round(remaining.fat)}g de grasa`,
      description: 'Opciones: aguacate (15g/100g), aceite de oliva (14g/cda), almendras (14g/30g), mani (14g/30g).',
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
