import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'
import { MEAL_TYPE_COLORS } from '../../lib/style-tokens'
import type { NutritionEntry, FoodItem, MealType } from '../../types'

interface EditMealSheetProps {
  entry: NutritionEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (entryId: string, data: Partial<NutritionEntry>) => Promise<void>
}

const MEAL_TYPES: { id: MealType; label: string }[] = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'cena', label: 'Cena' },
  { id: 'snack', label: 'Snack' },
]

export default function EditMealSheet({ entry, open, onOpenChange, onSave }: EditMealSheetProps) {
  const [mealType, setMealType] = useState<MealType>('desayuno')
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [saving, setSaving] = useState(false)

  // Reset form when entry changes
  useEffect(() => {
    if (entry) {
      setMealType(entry.mealType)
      // Deep copy to avoid mutating the original
      setFoods(entry.foods.map(f => ({ ...f })))
    }
  }, [entry])

  const updateFood = useCallback((index: number, field: keyof FoodItem, value: string | number) => {
    setFoods(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const removeFood = useCallback((index: number) => {
    setFoods(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleSave = async () => {
    if (!entry?.id || saving) return
    setSaving(true)

    const totalCalories = foods.reduce((s, f) => s + (Number(f.calories) || 0), 0)
    const totalProtein = foods.reduce((s, f) => s + (Number(f.protein) || 0), 0)
    const totalCarbs = foods.reduce((s, f) => s + (Number(f.carbs) || 0), 0)
    const totalFat = foods.reduce((s, f) => s + (Number(f.fat) || 0), 0)

    await onSave(entry.id, {
      mealType,
      foods,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
    })

    setSaving(false)
    onOpenChange(false)
  }

  if (!entry) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl overflow-hidden flex flex-col">
        <SheetHeader className="pb-2">
          <SheetTitle className="font-bebas text-xl tracking-widest">EDITAR COMIDA</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pb-4">
          {/* Meal type selector */}
          <div>
            <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Tipo</div>
            <div className="flex gap-1.5">
              {MEAL_TYPES.map(mt => {
                const colors = MEAL_TYPE_COLORS[mt.id]
                const active = mealType === mt.id
                return (
                  <button
                    key={mt.id}
                    onClick={() => setMealType(mt.id)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-[10px] font-mono tracking-widest transition-all border',
                      active
                        ? cn(colors.bg, colors.color, 'ring-1 ring-current/30')
                        : 'text-muted-foreground border-transparent hover:text-foreground'
                    )}
                  >
                    {mt.label.toUpperCase()}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Foods list */}
          <div>
            <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">
              Alimentos ({foods.length})
            </div>
            <div className="space-y-3">
              {foods.map((food, i) => (
                <div key={i} className="p-3 rounded-xl bg-muted/40 space-y-2.5">
                  {/* Food name */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={food.name}
                      onChange={e => updateFood(i, 'name', e.target.value)}
                      className="h-8 text-sm flex-1"
                      placeholder="Nombre del alimento"
                    />
                    <button
                      onClick={() => removeFood(i)}
                      className="shrink-0 size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      aria-label={`Eliminar ${food.name}`}
                    >
                      <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>

                  {/* Portion */}
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={food.portionAmount}
                      onChange={e => updateFood(i, 'portionAmount', Number(e.target.value))}
                      className="h-7 text-xs w-20"
                      min={0}
                      step={0.5}
                    />
                    <Input
                      value={food.portionUnit}
                      onChange={e => updateFood(i, 'portionUnit', e.target.value)}
                      className="h-7 text-xs flex-1"
                      placeholder="unidad"
                    />
                  </div>

                  {/* Macros — inline 4-column grid */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <div>
                      <label className="text-[9px] text-muted-foreground tracking-wider block mb-0.5">KCAL</label>
                      <Input
                        type="number"
                        value={food.calories}
                        onChange={e => updateFood(i, 'calories', Number(e.target.value))}
                        className="h-7 text-xs tabular-nums"
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-sky-500 tracking-wider block mb-0.5">PROT</label>
                      <Input
                        type="number"
                        value={food.protein}
                        onChange={e => updateFood(i, 'protein', Number(e.target.value))}
                        className="h-7 text-xs tabular-nums"
                        min={0}
                        step={0.1}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-amber-400 tracking-wider block mb-0.5">CARBS</label>
                      <Input
                        type="number"
                        value={food.carbs}
                        onChange={e => updateFood(i, 'carbs', Number(e.target.value))}
                        className="h-7 text-xs tabular-nums"
                        min={0}
                        step={0.1}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-pink-500 tracking-wider block mb-0.5">GRASA</label>
                      <Input
                        type="number"
                        value={food.fat}
                        onChange={e => updateFood(i, 'fat', Number(e.target.value))}
                        className="h-7 text-xs tabular-nums"
                        min={0}
                        step={0.1}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals preview */}
          <div className="flex gap-4 text-xs py-2 border-t border-border">
            <span className="text-foreground font-medium">
              {foods.reduce((s, f) => s + (Number(f.calories) || 0), 0)} kcal
            </span>
            <span className="text-sky-500">{foods.reduce((s, f) => s + (Number(f.protein) || 0), 0).toFixed(0)}g P</span>
            <span className="text-amber-400">{foods.reduce((s, f) => s + (Number(f.carbs) || 0), 0).toFixed(0)}g C</span>
            <span className="text-pink-500">{foods.reduce((s, f) => s + (Number(f.fat) || 0), 0).toFixed(0)}g G</span>
          </div>
        </div>

        {/* Save button — sticky at bottom */}
        <div className="pt-2 pb-2 border-t border-border">
          <Button
            onClick={handleSave}
            disabled={saving || foods.length === 0}
            className="w-full h-12 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-widest"
          >
            {saving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
