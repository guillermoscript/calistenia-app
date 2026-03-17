import { useState, useRef, useCallback } from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog'
import FoodNameInput from './FoodNameInput'
import { useFoodCatalog } from '../../hooks/useFoodCatalog'
import type { FoodItem, NutritionEntry } from '../../types'

interface MealLoggerProps {
  onAnalyze: (imageFile: File, mealType: string) => Promise<{ foods: FoodItem[] }>
  onSave: (entry: Omit<NutritionEntry, 'id' | 'user'>) => Promise<void>
}

type MealType = 'desayuno' | 'almuerzo' | 'cena' | 'snack'

const MEAL_OPTIONS: { id: MealType; label: string }[] = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'cena', label: 'Cena' },
  { id: 'snack', label: 'Snack' },
]

/** Compress image client-side to max 1024px */
function compressImage(file: File, maxSize = 1024): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= maxSize && height <= maxSize) {
        resolve(file)
        return
      }
      const ratio = Math.min(maxSize / width, maxSize / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }))
          } else {
            resolve(file)
          }
        },
        'image/jpeg',
        0.85
      )
    }
    img.src = url
  })
}

export default function MealLogger({ onAnalyze, onSave }: MealLoggerProps) {
  const { saveFoodToCatalog } = useFoodCatalog()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'capture' | 'analyzing' | 'review' | 'saving' | 'success'>('capture')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [mealType, setMealType] = useState<MealType>('almuerzo')
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setStep('capture')
    setImagePreview(null)
    setImageFile(null)
    setMealType('almuerzo')
    setFoods([])
    setError(null)
  }, [])

  const handleOpen = () => {
    resetState()
    setOpen(true)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setImageFile(compressed)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(compressed)
  }

  const handleAnalyze = async () => {
    if (!imageFile) return
    setStep('analyzing')
    setError(null)
    try {
      const result = await onAnalyze(imageFile, mealType)
      setFoods(result.foods || [])
      setStep('review')
    } catch (err) {
      setError('Error al analizar la imagen. Intenta de nuevo.')
      setStep('capture')
    }
  }

  const updateFood = (index: number, field: keyof FoodItem, value: string | number) => {
    setFoods(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f))
  }

  const removeFood = (index: number) => {
    setFoods(prev => prev.filter((_, i) => i !== index))
  }

  const addFood = () => {
    setFoods(prev => [...prev, { name: '', portion: '', calories: 0, protein: 0, carbs: 0, fat: 0 }])
  }

  const totals = foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (Number(f.calories) || 0),
      protein: acc.protein + (Number(f.protein) || 0),
      carbs: acc.carbs + (Number(f.carbs) || 0),
      fat: acc.fat + (Number(f.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  const handleSave = async () => {
    setStep('saving')
    try {
      await onSave({
        mealType,
        foods,
        totalCalories: totals.calories,
        totalProtein: totals.protein,
        totalCarbs: totals.carbs,
        totalFat: totals.fat,
        loggedAt: new Date().toISOString(),
      })
      // Save each named food to the shared catalog (fire-and-forget)
      foods.filter(f => f.name.trim()).forEach(f => saveFoodToCatalog(f))
      setStep('success')
      setTimeout(() => {
        setOpen(false)
        resetState()
      }, 1200)
    } catch {
      setError('Error al guardar. Intenta de nuevo.')
      setStep('review')
    }
  }

  return (
    <>
      {/* FAB trigger */}
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full bg-lime text-zinc-900 shadow-lg shadow-lime/20 flex items-center justify-center hover:bg-lime/90 transition-colors"
        aria-label="Registrar comida"
      >
        <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resetState() } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-bebas text-2xl tracking-wide">Registrar Comida</DialogTitle>
            <DialogDescription>Toma una foto de tu comida para analizar los macros</DialogDescription>
          </DialogHeader>

          {/* Step: Capture */}
          {step === 'capture' && (
            <div className="space-y-4">
              {/* Image capture */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="w-full rounded-lg" />
                  <button
                    onClick={() => { setImagePreview(null); setImageFile(null) }}
                    className="absolute top-2 right-2 size-7 rounded-full bg-background/80 text-foreground flex items-center justify-center"
                  >
                    X
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-40 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-lime/40 transition-colors"
                >
                  <CameraIcon className="size-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Tomar foto o seleccionar imagen</span>
                </button>
              )}

              {/* Meal type selection */}
              <div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">Tipo de Comida</div>
                <div className="grid grid-cols-4 gap-2">
                  {MEAL_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setMealType(opt.id)}
                      className={cn(
                        'py-2 px-1 rounded-lg border text-xs text-center transition-all',
                        mealType === opt.id
                          ? 'border-lime bg-lime/10 text-lime'
                          : 'border-border hover:border-lime/40'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className="text-sm text-red-500">{error}</div>}

              <Button
                onClick={handleAnalyze}
                disabled={!imageFile}
                className="w-full bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
              >
                ANALIZAR COMIDA
              </Button>

              {/* Manual entry option */}
              <Button
                variant="outline"
                onClick={() => { setFoods([{ name: '', portion: '', calories: 0, protein: 0, carbs: 0, fat: 0 }]); setStep('review') }}
                className="w-full text-[10px] tracking-widest"
              >
                AGREGAR MANUALMENTE
              </Button>
            </div>
          )}

          {/* Step: Analyzing */}
          {step === 'analyzing' && (
            <div className="space-y-3 py-8">
              <div className="text-center text-sm text-muted-foreground mb-4">Analizando tu comida...</div>
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {/* Step: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">Alimentos Detectados</div>

              {foods.map((food, idx) => (
                <div key={idx} className="p-3 bg-card border border-border rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <FoodNameInput
                      value={food.name}
                      onChange={val => updateFood(idx, 'name', val)}
                      onFoodSelect={selected => {
                        setFoods(prev => prev.map((f, i) => i === idx ? { ...f, ...selected } : f))
                      }}
                    />
                    <Input
                      value={food.portion}
                      onChange={e => updateFood(idx, 'portion', e.target.value)}
                      placeholder="Porcion"
                      className="w-24 h-8 text-sm"
                    />
                    <button
                      onClick={() => removeFood(idx)}
                      className="size-8 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded"
                    >
                      X
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground uppercase">kcal</label>
                      <Input
                        type="number"
                        value={food.calories}
                        onChange={e => updateFood(idx, 'calories', parseInt(e.target.value) || 0)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-sky-500 uppercase">prot</label>
                      <Input
                        type="number"
                        value={food.protein}
                        onChange={e => updateFood(idx, 'protein', parseInt(e.target.value) || 0)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-amber-400 uppercase">carbs</label>
                      <Input
                        type="number"
                        value={food.carbs}
                        onChange={e => updateFood(idx, 'carbs', parseInt(e.target.value) || 0)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-pink-500 uppercase">grasa</label>
                      <Input
                        type="number"
                        value={food.fat}
                        onChange={e => updateFood(idx, 'fat', parseInt(e.target.value) || 0)}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                onClick={addFood}
                className="w-full text-[10px] tracking-widest hover:border-lime hover:text-lime"
              >
                + AGREGAR ALIMENTO
              </Button>

              {/* Totals */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="text-[9px] text-muted-foreground tracking-widest uppercase mb-2">Total</div>
                <div className="grid grid-cols-4 gap-2 text-center text-sm">
                  <div>
                    <div className="font-bebas text-xl">{Math.round(totals.calories)}</div>
                    <div className="text-[9px] text-muted-foreground">kcal</div>
                  </div>
                  <div>
                    <div className="font-bebas text-xl text-sky-500">{Math.round(totals.protein)}</div>
                    <div className="text-[9px] text-muted-foreground">prot</div>
                  </div>
                  <div>
                    <div className="font-bebas text-xl text-amber-400">{Math.round(totals.carbs)}</div>
                    <div className="text-[9px] text-muted-foreground">carbs</div>
                  </div>
                  <div>
                    <div className="font-bebas text-xl text-pink-500">{Math.round(totals.fat)}</div>
                    <div className="text-[9px] text-muted-foreground">grasa</div>
                  </div>
                </div>
              </div>

              {error && <div className="text-sm text-red-500">{error}</div>}

              <Button
                onClick={handleSave}
                disabled={foods.length === 0}
                className="w-full bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
              >
                GUARDAR COMIDA
              </Button>
            </div>
          )}

          {/* Step: Saving */}
          {step === 'saving' && (
            <div className="py-8 text-center">
              <div className="text-sm text-muted-foreground">Guardando...</div>
            </div>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="py-8 text-center">
              <div className="text-4xl mb-2">✓</div>
              <div className="text-lime font-bebas text-2xl">Comida registrada</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
