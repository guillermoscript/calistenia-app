import { useState, useRef, useCallback, useEffect, useId, useMemo } from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import FoodNameInput from './FoodNameInput'
import PortionInput from './PortionInput'
import MealProgressBar from './MealProgressBar'
import { useFoodCatalog } from '../../hooks/useFoodCatalog'
import { useFoodHistory } from '../../hooks/useFoodHistory'
import { useMealTemplates } from '../../hooks/useMealTemplates'
import { calcMacros, normalizeToBase100, migrateLegacyFood, createEmptyFood } from '../../lib/macro-calc'
import type { FoodItem, NutritionEntry, DailyTotals, NutritionGoal, MealTemplate, MealType } from '../../types'

export interface MealLoggerContentProps {
  onAnalyze: (imageFile: File, mealType: string) => Promise<{ foods: FoodItem[] }>
  onSave: (entry: Omit<NutritionEntry, 'id' | 'user'>) => Promise<void>
  userId: string | null
  dailyTotals: DailyTotals
  goals: NutritionGoal | null
  getRecentEntries: () => Promise<NutritionEntry[]>
  /** Called after successful save (e.g. to navigate away or close modal) */
  onSaveSuccess?: () => void
}

const MEAL_OPTIONS: { id: MealType; label: string }[] = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'cena', label: 'Cena' },
  { id: 'snack', label: 'Snack' },
]

/** Auto-detect meal type based on current hour */
function getDefaultMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 10) return 'desayuno'
  if (hour < 15) return 'almuerzo'
  if (hour < 18) return 'snack'
  return 'cena'
}

const PORTION_PRESETS = [50, 100, 150, 200, 250]

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

export default function MealLoggerContent({
  onAnalyze, onSave, userId, dailyTotals, goals, getRecentEntries, onSaveSuccess,
}: MealLoggerContentProps) {
  const { saveFoodToCatalog } = useFoodCatalog()
  const { getRecentFoods, getHourSuggestions, trackFood } = useFoodHistory(userId)
  const { getTemplates, saveTemplate, useTemplate, deleteTemplate } = useMealTemplates(userId)

  const [step, setStep] = useState<'capture' | 'analyzing' | 'review' | 'saving' | 'success'>('capture')
  const [captureSubView, setCaptureSubView] = useState<'main' | 'repeatMeal' | 'templates'>('main')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [mealType, setMealType] = useState<MealType>(getDefaultMealType)
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [manualEditIndex, setManualEditIndex] = useState<number | null>(null)
  const [quickText, setQuickText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)
  const formId = useId()

  // Recent foods & suggestions
  const [recentFoods, setRecentFoods] = useState<FoodItem[]>([])
  const [hourSuggestions, setHourSuggestions] = useState<FoodItem[]>([])
  const [recentEntries, setRecentEntries] = useState<NutritionEntry[]>([])
  const [templates, setTemplates] = useState<MealTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)

  // Load recents when review step opens
  useEffect(() => {
    if (step === 'review' && userId) {
      getRecentFoods(8).then(setRecentFoods).catch(() => {})
      getHourSuggestions(new Date().getHours()).then(setHourSuggestions).catch(() => {})
    }
  }, [step, userId, getRecentFoods, getHourSuggestions])

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
    cancelledRef.current = false
    abortControllerRef.current = new AbortController()
    setStep('analyzing')
    setError(null)
    try {
      const result = await onAnalyze(imageFile, mealType)
      if (cancelledRef.current) return
      const normalized = (result.foods || []).map(f => {
        if (!('baseCal100' in f) || !f.baseCal100) {
          return migrateLegacyFood(f as any)
        }
        return f
      })
      if (normalized.length === 0) {
        setError('No se detectaron alimentos. Intenta con otra foto o agrega manualmente.')
        setStep('capture')
        return
      }
      setFoods(normalized)
      setStep('review')
    } catch {
      if (cancelledRef.current) return
      setError('Error al analizar la imagen. Intenta de nuevo.')
      setStep('capture')
    } finally {
      abortControllerRef.current = null
    }
  }

  const handleCancelAnalysis = () => {
    cancelledRef.current = true
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setStep('capture')
  }

  const handleQuickTextSubmit = () => {
    const text = quickText.trim()
    if (!text) return
    const names = text.split(',').map(s => s.trim()).filter(Boolean)
    const newFoods = names.map(name => {
      const food = createEmptyFood()
      food.name = name
      return food
    })
    setFoods(newFoods)
    setQuickText('')
    setStep('review')
  }

  const handlePortionChange = (index: number, amount: number, unit: FoodItem['portionUnit'], unitWeight: number) => {
    setFoods(prev => prev.map((f, i) => {
      if (i !== index) return f
      const updated = { ...f, portionAmount: amount, portionUnit: unit, unitWeightInGrams: unitWeight }
      return calcMacros(updated)
    }))
  }

  const updateFood = (index: number, field: keyof FoodItem, value: string | number) => {
    setFoods(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f))
  }

  const removeFood = (index: number) => {
    setFoods(prev => prev.filter((_, i) => i !== index))
  }

  const addFood = () => {
    setFoods(prev => [...prev, createEmptyFood()])
  }

  const addRecentFood = (food: FoodItem) => {
    setFoods(prev => [...prev, { ...food }])
  }

  const totals = useMemo(() => foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (Number(f.calories) || 0),
      protein: acc.protein + (Number(f.protein) || 0),
      carbs: acc.carbs + (Number(f.carbs) || 0),
      fat: acc.fat + (Number(f.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  ), [foods])

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
      foods.filter(f => f.name.trim()).forEach(f => saveFoodToCatalog(f))
      const hour = new Date().getHours()
      foods.filter(f => f.name.trim()).forEach(f => trackFood(f, mealType, hour))
      setStep('success')
    } catch {
      setError('Error al guardar. Intenta de nuevo.')
      setStep('review')
    }
  }

  const handleResetForm = () => {
    setStep('capture')
    setCaptureSubView('main')
    setImagePreview(null)
    setImageFile(null)
    setMealType(getDefaultMealType())
    setFoods([])
    setError(null)
    setManualEditIndex(null)
    setQuickText('')
    setShowSaveTemplate(false)
    setTemplateName('')
  }

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || foods.length === 0) return
    try {
      await saveTemplate(templateName.trim(), foods, mealType)
      setShowSaveTemplate(false)
      setTemplateName('')
    } catch { /* ignore */ }
  }

  const loadRepeatMeal = async () => {
    setCaptureSubView('repeatMeal')
    try {
      const entries = await getRecentEntries()
      setRecentEntries(entries)
    } catch { /* ignore */ }
  }

  const loadTemplates = async () => {
    setCaptureSubView('templates')
    try {
      const tmpl = await getTemplates()
      setTemplates(tmpl)
    } catch { /* ignore */ }
  }

  const selectRecentEntry = (entry: NutritionEntry) => {
    setMealType(entry.mealType)
    const normalized = entry.foods.map(f => {
      if (!('baseCal100' in f) || !(f as FoodItem).baseCal100) {
        return migrateLegacyFood(f as any)
      }
      return f as FoodItem
    })
    setFoods(normalized)
    setCaptureSubView('main')
    setStep('review')
  }

  const selectTemplate = async (template: MealTemplate) => {
    try {
      const tmplFoods = await useTemplate(template.id!)
      setMealType(template.mealType)
      setFoods(tmplFoods)
      setCaptureSubView('main')
      setStep('review')
    } catch { /* ignore */ }
  }

  const mealLabel = MEAL_OPTIONS.find(o => o.id === mealType)?.label ?? mealType

  return (
    <div className="space-y-4 motion-safe:animate-fade-in">
      {/* Step: Capture */}
      {step === 'capture' && (
        <div className="space-y-4 motion-safe:animate-fade-in">
          {captureSubView === 'main' && (
            <>
              {/* Quick text input */}
              <div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Registro rápido</div>
                <form
                  onSubmit={e => { e.preventDefault(); handleQuickTextSubmit() }}
                  className="flex gap-2"
                >
                  <input
                    value={quickText}
                    onChange={e => setQuickText(e.target.value)}
                    placeholder="Escribe tu comida... ej: pollo, arroz, ensalada"
                    className="flex-1 h-10 text-sm px-3 rounded-lg border border-input bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground/60"
                  />
                  <button
                    type="submit"
                    disabled={!quickText.trim()}
                    className={cn(
                      'size-10 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                      quickText.trim()
                        ? 'bg-lime text-zinc-900 hover:bg-lime/90'
                        : 'bg-muted text-muted-foreground'
                    )}
                    aria-label="Enviar"
                  >
                    <SendIcon className="size-4" />
                  </button>
                </form>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground tracking-widest uppercase">o</span>
                <div className="flex-1 h-px bg-border" />
              </div>

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
                    aria-label="Eliminar imagen"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-48 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-lime/40 transition-colors bg-muted/30"
                >
                  <CameraIcon className="size-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Tomar foto o seleccionar imagen</span>
                </button>
              )}

              <fieldset>
                <legend className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Tipo de comida</legend>
                <div className="grid grid-cols-4 gap-1.5" role="group">
                  {MEAL_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMealType(opt.id)}
                      aria-pressed={mealType === opt.id}
                      className={cn(
                        'py-1.5 px-1 rounded-md border text-[11px] text-center transition-all',
                        mealType === opt.id
                          ? 'border-lime bg-lime/10 text-lime'
                          : 'border-border hover:border-lime/40 text-muted-foreground'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {error && <div className="text-sm text-red-500" role="alert">{error}</div>}

              <Button
                onClick={handleAnalyze}
                disabled={!imageFile}
                className="w-full bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
              >
                ANALIZAR COMIDA
              </Button>

              <button
                onClick={() => { setFoods([createEmptyFood()]); setStep('review') }}
                className="w-full text-center text-xs text-muted-foreground hover:text-lime transition-colors py-1"
              >
                Agregar manualmente
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadRepeatMeal}
                  className="flex-1 text-center py-2 rounded-lg border border-border text-[10px] text-muted-foreground tracking-widest hover:border-lime/40 hover:text-lime transition-colors"
                >
                  REPETIR COMIDA
                </button>
                <button
                  onClick={loadTemplates}
                  className="flex-1 text-center py-2 rounded-lg border border-border text-[10px] text-muted-foreground tracking-widest hover:border-lime/40 hover:text-lime transition-colors"
                >
                  MIS TEMPLATES
                </button>
              </div>
            </>
          )}

          {captureSubView === 'repeatMeal' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Comidas Recientes</div>
                <button onClick={() => setCaptureSubView('main')} className="text-xs text-muted-foreground hover:text-foreground">
                  Volver
                </button>
              </div>
              {recentEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No hay comidas recientes</div>
              ) : (
                recentEntries.map((entry, i) => (
                  <button
                    key={entry.id || i}
                    onClick={() => selectRecentEntry(entry)}
                    className="w-full text-left p-3 bg-card border border-border rounded-lg hover:border-lime/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-mono tracking-wide px-1.5 py-0.5 rounded-full uppercase bg-muted text-muted-foreground">
                        {entry.mealType}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(entry.loggedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-foreground truncate">
                      {entry.foods.map(f => f.name).filter(Boolean).join(', ') || 'Sin nombre'}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {Math.round(entry.totalCalories)} kcal · P{Math.round(entry.totalProtein)}g · C{Math.round(entry.totalCarbs)}g · G{Math.round(entry.totalFat)}g
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {captureSubView === 'templates' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Mis Templates</div>
                <button onClick={() => setCaptureSubView('main')} className="text-xs text-muted-foreground hover:text-foreground">
                  Volver
                </button>
              </div>
              {templates.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No hay templates guardados</div>
              ) : (
                templates.map(tmpl => (
                  <div key={tmpl.id} className="flex items-center gap-2">
                    <button
                      onClick={() => selectTemplate(tmpl)}
                      className="flex-1 text-left p-3 bg-card border border-border rounded-lg hover:border-lime/40 transition-colors"
                    >
                      <div className="text-sm font-medium">{tmpl.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {tmpl.foods.length} alimentos · {Math.round(tmpl.foods.reduce((s, f) => s + (f.calories || 0), 0))} kcal
                      </div>
                    </button>
                    <button
                      onClick={async () => {
                        await deleteTemplate(tmpl.id!)
                        setTemplates(prev => prev.filter(t => t.id !== tmpl.id))
                      }}
                      className="size-8 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded shrink-0"
                      aria-label={`Eliminar template ${tmpl.name}`}
                    >
                      <CloseIcon className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Step: Analyzing */}
      {step === 'analyzing' && (
        <div className="space-y-4 py-4 motion-safe:animate-fade-in" role="status" aria-label="Analizando comida">
          {imagePreview ? (
            <div className="relative overflow-hidden rounded-lg">
              <img src={imagePreview} alt="Analizando..." className="w-full rounded-lg opacity-60" />
              <div
                className="absolute inset-0 bg-gradient-to-b from-transparent via-lime/10 to-transparent animate-pulse"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block size-6 border-2 border-lime/30 border-t-lime rounded-full animate-spin mb-2" />
                  <div className="text-sm text-foreground font-medium">Analizando tu comida...</div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center text-sm text-muted-foreground mb-4">Analizando tu comida...</div>
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="h-10 bg-muted rounded-lg animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </>
          )}
          <button
            onClick={handleCancelAnalysis}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Cancelar análisis
          </button>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div className="space-y-4 motion-safe:animate-fade-in">
          {/* Daily progress context first */}
          <MealProgressBar
            dailyTotals={dailyTotals}
            mealTotals={totals}
            goals={goals}
          />

          {recentFoods.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Recientes</div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {recentFoods.map((food, i) => (
                  <button
                    key={i}
                    onClick={() => addRecentFood(food)}
                    className="shrink-0 px-3 py-1.5 rounded-full border border-border text-[11px] hover:border-lime/40 hover:text-lime transition-colors"
                  >
                    {food.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hourSuggestions.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">Habitual a esta hora</div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {hourSuggestions.map((food, i) => (
                  <button
                    key={i}
                    onClick={() => addRecentFood(food)}
                    className="shrink-0 px-3 py-1.5 rounded-full border border-lime/30 bg-lime/5 text-[11px] text-lime hover:bg-lime/10 transition-colors"
                  >
                    {food.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">Alimentos Detectados</div>

          {foods.map((food, idx) => (
            <div key={idx} className="p-3 bg-card border border-border rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <FoodNameInput
                  value={food.name}
                  onChange={val => updateFood(idx, 'name', val)}
                  onFoodSelect={selected => {
                    const normalized = migrateLegacyFood(selected as any)
                    setFoods(prev => prev.map((f, i) => i === idx ? normalized : f))
                  }}
                />
                <button
                  onClick={() => removeFood(idx)}
                  className="size-8 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded shrink-0"
                  aria-label={`Eliminar ${food.name || 'alimento'}`}
                >
                  <CloseIcon className="size-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <PortionInput
                  amount={food.portionAmount}
                  unit={food.portionUnit}
                  unitWeight={food.unitWeightInGrams}
                  onChange={(amount, unit, unitWeight) => handlePortionChange(idx, amount, unit, unitWeight)}
                />
              </div>
              {/* Quick portion presets for gram-based portions */}
              {food.portionUnit === 'g' && (
                <div className="flex gap-1.5 flex-wrap">
                  {PORTION_PRESETS.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handlePortionChange(idx, preset, 'g', food.unitWeightInGrams)}
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] border transition-colors',
                        food.portionAmount === preset
                          ? 'border-lime bg-lime/10 text-lime'
                          : 'border-border text-muted-foreground hover:border-lime/40'
                      )}
                    >
                      {preset}g
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                {manualEditIndex === idx ? (
                  <>
                    <div>
                      <label htmlFor={`${formId}-cal-${idx}`} className="text-[10px] text-muted-foreground uppercase block">kcal</label>
                      <input
                        id={`${formId}-cal-${idx}`}
                        type="number"
                        value={food.calories}
                        onChange={e => updateFood(idx, 'calories', parseInt(e.target.value) || 0)}
                        className="w-full h-8 text-xs px-2 rounded-md border border-input bg-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${formId}-prot-${idx}`} className="text-[10px] text-sky-500 uppercase block">prot</label>
                      <input
                        id={`${formId}-prot-${idx}`}
                        type="number"
                        value={food.protein}
                        onChange={e => updateFood(idx, 'protein', parseFloat(e.target.value) || 0)}
                        className="w-full h-8 text-xs px-2 rounded-md border border-input bg-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${formId}-carbs-${idx}`} className="text-[10px] text-amber-400 uppercase block">carbs</label>
                      <input
                        id={`${formId}-carbs-${idx}`}
                        type="number"
                        value={food.carbs}
                        onChange={e => updateFood(idx, 'carbs', parseFloat(e.target.value) || 0)}
                        className="w-full h-8 text-xs px-2 rounded-md border border-input bg-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${formId}-fat-${idx}`} className="text-[10px] text-pink-500 uppercase block">grasa</label>
                      <input
                        id={`${formId}-fat-${idx}`}
                        type="number"
                        value={food.fat}
                        onChange={e => updateFood(idx, 'fat', parseFloat(e.target.value) || 0)}
                        className="w-full h-8 text-xs px-2 rounded-md border border-input bg-transparent"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">kcal</div>
                      <div className="h-7 text-xs flex items-center px-1 font-medium">{Math.round(food.calories)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-sky-500 uppercase">prot</div>
                      <div className="h-7 text-xs flex items-center px-1 text-sky-500 font-medium">{Math.round(food.protein * 10) / 10}g</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-amber-400 uppercase">carbs</div>
                      <div className="h-7 text-xs flex items-center px-1 text-amber-400 font-medium">{Math.round(food.carbs * 10) / 10}g</div>
                    </div>
                    <div className="flex items-end gap-1">
                      <div className="flex-1">
                        <div className="text-[10px] text-pink-500 uppercase">grasa</div>
                        <div className="h-7 text-xs flex items-center px-1 text-pink-500 font-medium">{Math.round(food.fat * 10) / 10}g</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setManualEditIndex(manualEditIndex === idx ? null : idx)}
                        aria-label="Editar macros manualmente"
                        className="size-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded transition-colors"
                      >
                        <PencilIcon className="size-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
              {manualEditIndex === idx && (
                <button
                  type="button"
                  onClick={() => {
                    setFoods(prev => prev.map((f, i) => i === idx ? normalizeToBase100(f) : f))
                    setManualEditIndex(null)
                  }}
                  className="text-[10px] text-lime tracking-widest hover:text-lime/80 py-1"
                >
                  LISTO
                </button>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            onClick={addFood}
            className="w-full text-[10px] tracking-widest hover:border-lime hover:text-lime"
          >
            + AGREGAR ALIMENTO
          </Button>

          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">Total de esta comida</div>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              <div>
                <div className="font-bebas text-xl tabular-nums">{Math.round(totals.calories)}</div>
                <div className="text-[10px] text-muted-foreground">kcal</div>
              </div>
              <div>
                <div className="font-bebas text-xl text-sky-500 tabular-nums">{Math.round(totals.protein)}</div>
                <div className="text-[10px] text-muted-foreground">prot</div>
              </div>
              <div>
                <div className="font-bebas text-xl text-amber-400 tabular-nums">{Math.round(totals.carbs)}</div>
                <div className="text-[10px] text-muted-foreground">carbs</div>
              </div>
              <div>
                <div className="font-bebas text-xl text-pink-500 tabular-nums">{Math.round(totals.fat)}</div>
                <div className="text-[10px] text-muted-foreground">grasa</div>
              </div>
            </div>
          </div>

          {!showSaveTemplate ? (
            <button
              onClick={() => setShowSaveTemplate(true)}
              className="w-full text-center text-[10px] text-muted-foreground tracking-widest hover:text-lime transition-colors"
            >
              GUARDAR COMO TEMPLATE
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Nombre del template"
                maxLength={100}
                aria-label="Nombre del template"
                className="flex-1 h-8 text-sm px-3 rounded-md border border-input bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button
                size="sm"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
                className="h-8 bg-lime text-zinc-900 text-[10px] tracking-widest"
              >
                GUARDAR
              </Button>
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
                aria-label="Cancelar template"
              >
                <CloseIcon className="size-3" />
              </button>
            </div>
          )}

          {error && <div className="text-sm text-red-500" role="alert">{error}</div>}

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
        <div className="py-12 text-center motion-safe:animate-fade-in" role="status">
          <div className="inline-block size-5 border-2 border-lime/30 border-t-lime rounded-full animate-spin mb-3" />
          <div className="text-sm text-muted-foreground">Guardando comida...</div>
        </div>
      )}

      {/* Step: Success */}
      {step === 'success' && (
        <div className="py-8 motion-safe:animate-fade-in">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center size-14 rounded-full bg-lime/10 border border-lime/20 mb-3 motion-safe:animate-scale-in">
              <svg className="size-7 text-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="text-lime font-bebas text-2xl tracking-wide">Comida registrada</div>
          </div>

          {/* Meal summary */}
          <div className="p-4 bg-card border border-border rounded-lg space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono tracking-wide px-2 py-0.5 rounded-full uppercase bg-lime/10 text-lime border border-lime/20">
                {mealLabel}
              </span>
              <span className="font-bebas text-lg tabular-nums">{Math.round(totals.calories)} kcal</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted/50 rounded-md">
                <div className="font-bebas text-lg text-sky-500 tabular-nums">{Math.round(totals.protein)}g</div>
                <div className="text-[10px] text-muted-foreground">Proteína</div>
              </div>
              <div className="p-2 bg-muted/50 rounded-md">
                <div className="font-bebas text-lg text-amber-400 tabular-nums">{Math.round(totals.carbs)}g</div>
                <div className="text-[10px] text-muted-foreground">Carbos</div>
              </div>
              <div className="p-2 bg-muted/50 rounded-md">
                <div className="font-bebas text-lg text-pink-500 tabular-nums">{Math.round(totals.fat)}g</div>
                <div className="text-[10px] text-muted-foreground">Grasa</div>
              </div>
            </div>
            {goals && (
              <div className="text-xs text-muted-foreground text-center pt-1 border-t border-border">
                Llevas {Math.round(dailyTotals.calories + totals.calories)} de {Math.round(goals.dailyCalories)} kcal hoy
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => onSaveSuccess?.()}
              className="flex-1 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-wide"
            >
              LISTO
            </Button>
            <Button
              variant="outline"
              onClick={handleResetForm}
              className="flex-1 font-bebas text-lg tracking-wide"
            >
              REGISTRAR OTRA
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9z" />
    </svg>
  )
}
