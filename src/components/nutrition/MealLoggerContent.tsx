import { useState, useRef, useEffect, useMemo } from 'react'
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

const MAX_PHOTOS = 5

export interface MealLoggerContentProps {
  onAnalyze: (imageFiles: File[], mealType: string, description?: string) => Promise<{ foods: FoodItem[]; meal_description?: string }>
  onSave: (entry: Omit<NutritionEntry, 'id' | 'user'>, photoFiles?: File[]) => Promise<void>
  userId: string | null
  dailyTotals: DailyTotals
  goals: NutritionGoal | null
  getRecentEntries: () => Promise<NutritionEntry[]>
  /** Called after successful save (e.g. to navigate away or close modal) */
  onSaveSuccess?: () => void
}

const MEAL_OPTIONS: { id: MealType; label: string; icon: string }[] = [
  { id: 'desayuno', label: 'Desayuno', icon: '☀️' },
  { id: 'almuerzo', label: 'Almuerzo', icon: '🍽️' },
  { id: 'cena', label: 'Cena', icon: '🌙' },
  { id: 'snack', label: 'Snack', icon: '🍎' },
]

/** Auto-detect meal type based on current hour */
function getDefaultMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 10) return 'desayuno'
  if (hour < 15) return 'almuerzo'
  if (hour < 18) return 'snack'
  return 'cena'
}

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
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [mealType, setMealType] = useState<MealType>(getDefaultMealType)
  const [foods, setFoods] = useState<FoodItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingMacro, setEditingMacro] = useState<{ index: number; field: keyof FoodItem } | null>(null)
  const [quickText, setQuickText] = useState('')
  const [imageDescription, setImageDescription] = useState('')
  const [mealDescription, setMealDescription] = useState('')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)
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
    if (!file || imageFiles.length >= MAX_PHOTOS) return
    const compressed = await compressImage(file)
    setImageFiles(prev => [...prev, compressed])
    const reader = new FileReader()
    reader.onload = () => setImagePreviews(prev => [...prev, reader.result as string])
    reader.readAsDataURL(compressed)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  const removePhoto = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleAnalyze = async () => {
    if (imageFiles.length === 0) return
    cancelledRef.current = false
    abortControllerRef.current = new AbortController()
    setStep('analyzing')
    setError(null)
    try {
      const result = await onAnalyze(imageFiles, mealType, imageDescription.trim() || undefined)
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
      setMealDescription(result.meal_description || '')
      setStep('review')
    } catch {
      if (cancelledRef.current) return
      setError('No pudimos analizar la imagen. Verifica que sea una foto de comida e intenta de nuevo.')
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
      }, imageFiles.length > 0 ? imageFiles : undefined)
      foods.filter(f => f.name.trim()).forEach(f => saveFoodToCatalog(f))
      const hour = new Date().getHours()
      foods.filter(f => f.name.trim()).forEach(f => trackFood(f, mealType, hour))
      setStep('success')
    } catch {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.')
      setStep('review')
    }
  }

  const handleResetForm = () => {
    setStep('capture')
    setCaptureSubView('main')
    setImagePreviews([])
    setImageFiles([])
    setMealType(getDefaultMealType())
    setFoods([])
    setError(null)
    setEditingMacro(null)
    setQuickText('')
    setImageDescription('')
    setMealDescription('')
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
        <div className="space-y-5 motion-safe:animate-fade-in">
          {captureSubView === 'main' && (
            <>
              {/* ── Meal type selector ── */}
              <div className="flex gap-1.5 p-1 bg-muted/50 rounded-xl">
                {MEAL_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMealType(opt.id)}
                    aria-pressed={mealType === opt.id}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-center transition-all',
                      mealType === opt.id
                        ? 'bg-background shadow-sm ring-1 ring-lime-400/30 text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span className="text-base leading-none">{opt.icon}</span>
                    <span className="text-[10px] font-mono tracking-wide">{opt.label}</span>
                  </button>
                ))}
              </div>

              {/* ── Main input area ── */}
              <div className="space-y-3">
                {/* Quick text input */}
                <form
                  onSubmit={e => { e.preventDefault(); handleQuickTextSubmit() }}
                  className="relative"
                >
                  <input
                    value={quickText}
                    onChange={e => setQuickText(e.target.value)}
                    placeholder="¿Qué comiste? ej: pollo, arroz, ensalada"
                    maxLength={500}
                    className="w-full h-12 text-base pl-4 pr-12 rounded-xl border border-border bg-muted/30 focus:outline-none focus:border-lime-400/40 focus:ring-1 focus:ring-lime-400/20 placeholder:text-muted-foreground/50 transition-all"
                  />
                  {quickText.trim() && (
                    <button
                      type="submit"
                      className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-lg bg-lime-400 text-zinc-900 flex items-center justify-center hover:bg-lime-300 transition-colors"
                      aria-label="Registrar"
                    >
                      <ArrowIcon className="size-4" />
                    </button>
                  )}
                </form>

                {/* Hidden file inputs: camera (with capture) and gallery (without) */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {imagePreviews.length > 0 ? (
                  <div className="space-y-3">
                    {/* Photo strip */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                      {imagePreviews.map((preview, i) => (
                        <div key={i} className="relative shrink-0 w-[calc(50%-4px)] max-w-[180px] aspect-square rounded-xl overflow-hidden">
                          <img src={preview} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removePhoto(i)}
                            className="absolute top-1.5 right-1.5 size-6 rounded-full bg-background/80 backdrop-blur-sm text-foreground flex items-center justify-center hover:bg-background transition-colors"
                            aria-label={`Eliminar foto ${i + 1}`}
                          >
                            <CloseIcon className="size-3" />
                          </button>
                          <div className="absolute bottom-1.5 left-1.5 text-[9px] font-mono text-white/70 bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded">
                            {i + 1}/{imagePreviews.length}
                          </div>
                        </div>
                      ))}
                      {imageFiles.length < MAX_PHOTOS && (
                        <div className="shrink-0 w-[calc(50%-4px)] max-w-[180px] aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2">
                          <span className="text-[9px] font-mono text-muted-foreground/50 tracking-wide">
                            {imageFiles.length}/{MAX_PHOTOS}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => cameraInputRef.current?.click()}
                              className="size-9 rounded-lg flex items-center justify-center hover:bg-lime-400/10 transition-colors"
                              title="Tomar foto"
                            >
                              <CameraIcon className="size-4 text-muted-foreground/60" />
                            </button>
                            <button
                              onClick={() => galleryInputRef.current?.click()}
                              className="size-9 rounded-lg flex items-center justify-center hover:bg-lime-400/10 transition-colors"
                              title="Elegir de galeria"
                            >
                              <GalleryIcon className="size-4 text-muted-foreground/60" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Description field for AI context */}
                    <div className="relative">
                      <textarea
                        value={imageDescription}
                        onChange={e => setImageDescription(e.target.value)}
                        placeholder="Describe tu comida para mejor precision... ej: pollo a la plancha con arroz integral y ensalada, unos 200g de pollo"
                        maxLength={500}
                        rows={2}
                        className="w-full text-base px-3.5 py-3 rounded-xl border border-border bg-muted/30 focus:outline-none focus:border-lime-400/40 focus:ring-1 focus:ring-lime-400/20 placeholder:text-muted-foreground/40 transition-all resize-none leading-relaxed"
                      />
                      {imageDescription && (
                        <div className="absolute bottom-2 right-3 text-[9px] text-muted-foreground/40 tabular-nums">
                          {imageDescription.length}/500
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={handleAnalyze}
                      className="w-full h-12 bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas text-base tracking-widest shadow-lg shadow-lime-400/10"
                    >
                      ANALIZAR CON IA
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 hover:border-lime-400/40 hover:bg-lime-400/5 transition-all"
                    >
                      <CameraIcon className="size-6 text-muted-foreground" />
                      <span className="text-[10px] font-mono tracking-wide text-muted-foreground">CAMARA</span>
                    </button>
                    <button
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 hover:border-lime-400/40 hover:bg-lime-400/5 transition-all"
                    >
                      <GalleryIcon className="size-6 text-muted-foreground" />
                      <span className="text-[10px] font-mono tracking-wide text-muted-foreground">GALERIA</span>
                    </button>
                    <button
                      onClick={() => { setFoods([createEmptyFood()]); setStep('review') }}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 hover:border-lime-400/40 hover:bg-lime-400/5 transition-all"
                    >
                      <PencilIcon className="size-6 text-muted-foreground" />
                      <span className="text-[10px] font-mono tracking-wide text-muted-foreground">MANUAL</span>
                    </button>
                    <button
                      onClick={loadRepeatMeal}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 hover:border-lime-400/40 hover:bg-lime-400/5 transition-all"
                    >
                      <RepeatIcon className="size-6 text-muted-foreground" />
                      <span className="text-[10px] font-mono tracking-wide text-muted-foreground">REPETIR</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Templates link */}
              <button
                onClick={loadTemplates}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-mono tracking-widest text-muted-foreground hover:text-lime-400 transition-colors"
              >
                <TemplateIcon className="size-3.5" />
                MIS PLANTILLAS
              </button>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400" role="alert">
                  {error}
                </div>
              )}
            </>
          )}

          {captureSubView === 'repeatMeal' && (
            <div className="space-y-3 motion-safe:animate-fade-in">
              <div className="flex items-center gap-3">
                <button onClick={() => setCaptureSubView('main')} className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                  <BackIcon className="size-4 text-muted-foreground" />
                </button>
                <div className="font-bebas text-lg tracking-wide">COMIDAS RECIENTES</div>
              </div>
              {recentEntries.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-2xl mb-2">🍽️</div>
                  <div className="text-sm text-muted-foreground">No hay comidas recientes</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentEntries.map((entry, i) => (
                    <button
                      key={entry.id || i}
                      onClick={() => selectRecentEntry(entry)}
                      className="w-full text-left p-3.5 bg-muted/30 border border-border rounded-xl hover:border-lime-400/30 hover:bg-lime-400/[0.03] transition-all"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full uppercase bg-muted text-muted-foreground">
                          {entry.mealType}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(entry.loggedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm text-foreground leading-snug">
                        {entry.foods.map(f => f.name).filter(Boolean).join(', ') || 'Sin nombre'}
                      </div>
                      <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground/70">{Math.round(entry.totalCalories)} kcal</span>
                        <span className="text-sky-500">P {Math.round(entry.totalProtein)}g</span>
                        <span className="text-amber-400">C {Math.round(entry.totalCarbs)}g</span>
                        <span className="text-pink-500">G {Math.round(entry.totalFat)}g</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {captureSubView === 'templates' && (
            <div className="space-y-3 motion-safe:animate-fade-in">
              <div className="flex items-center gap-3">
                <button onClick={() => setCaptureSubView('main')} className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                  <BackIcon className="size-4 text-muted-foreground" />
                </button>
                <div className="font-bebas text-lg tracking-wide">MIS PLANTILLAS</div>
              </div>
              {templates.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-2xl mb-2">📋</div>
                  <div className="text-sm text-muted-foreground">No hay plantillas guardadas</div>
                  <div className="text-xs text-muted-foreground/60 mt-1">Guarda una comida como plantilla para reutilizarla</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map(tmpl => (
                    <div key={tmpl.id} className="flex items-center gap-2">
                      <button
                        onClick={() => selectTemplate(tmpl)}
                        className="flex-1 text-left p-3.5 bg-muted/30 border border-border rounded-xl hover:border-lime-400/30 hover:bg-lime-400/[0.03] transition-all"
                      >
                        <div className="text-sm font-medium">{tmpl.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {tmpl.foods.length} alimento{tmpl.foods.length !== 1 ? 's' : ''} · {Math.round(tmpl.foods.reduce((s, f) => s + (f.calories || 0), 0))} kcal
                        </div>
                      </button>
                      <button
                        onClick={async () => {
                          await deleteTemplate(tmpl.id!)
                          setTemplates(prev => prev.filter(t => t.id !== tmpl.id))
                        }}
                        className="size-9 flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg shrink-0 transition-colors"
                        aria-label={`Eliminar plantilla ${tmpl.name}`}
                      >
                        <CloseIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step: Analyzing */}
      {step === 'analyzing' && (
        <div className="space-y-4 py-4 motion-safe:animate-fade-in" role="status" aria-label="Analizando comida">
          {imagePreviews.length > 0 ? (
            <div className="relative overflow-hidden rounded-xl">
              <img src={imagePreviews[0]} alt="Analizando..." className="w-full rounded-xl opacity-60" />
              {imagePreviews.length > 1 && (
                <div className="absolute top-2 left-2 text-[10px] font-mono text-white/80 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">
                  {imagePreviews.length} fotos
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-lime-400/10 to-transparent animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center bg-background/70 backdrop-blur-sm rounded-xl px-6 py-4">
                  <div className="inline-block size-6 border-2 border-lime-400/30 border-t-lime-400 rounded-full animate-spin mb-2" />
                  <div className="text-sm text-foreground font-medium">Analizando tu comida...</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Detectando alimentos y macros</div>
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
            Cancelar
          </button>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div className="space-y-4 motion-safe:animate-fade-in">
          {/* Meal type indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setStep('capture'); setFoods([]); setImagePreviews([]); setImageFiles([]) }}
                className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              >
                <BackIcon className="size-4 text-muted-foreground" />
              </button>
              <span className="font-bebas text-lg tracking-wide">{mealLabel.toUpperCase()}</span>
            </div>
            {/* Meal type quick switch */}
            <div className="flex gap-1">
              {MEAL_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setMealType(opt.id)}
                  className={cn(
                    'size-8 rounded-lg flex items-center justify-center text-sm transition-all',
                    mealType === opt.id
                      ? 'bg-lime-400/10 ring-1 ring-lime-400/30'
                      : 'hover:bg-muted text-muted-foreground'
                  )}
                  title={opt.label}
                >
                  {opt.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Daily progress context */}
          <MealProgressBar
            dailyTotals={dailyTotals}
            mealTotals={totals}
            goals={goals}
          />

          {/* Quick-add chips: recent + hourly */}
          {(recentFoods.length > 0 || hourSuggestions.length > 0) && (
            <div className="space-y-2">
              {hourSuggestions.length > 0 && (
                <div>
                  <div className="text-[9px] text-muted-foreground tracking-widest uppercase mb-1.5">Habitual a esta hora</div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                    {hourSuggestions.map((food, i) => (
                      <button
                        key={`h-${i}`}
                        onClick={() => addRecentFood(food)}
                        className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-full border border-lime-400/30 bg-lime-400/5 text-xs text-lime-400 hover:bg-lime-400/10 active:bg-lime-400/20 transition-colors"
                      >
                        + <span className="truncate max-w-[20ch] inline-block align-bottom">{food.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recentFoods.length > 0 && (
                <div>
                  <div className="text-[9px] text-muted-foreground tracking-widest uppercase mb-1.5">Recientes</div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                    {recentFoods.map((food, i) => (
                      <button
                        key={`r-${i}`}
                        onClick={() => addRecentFood(food)}
                        className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:border-lime-400/40 hover:text-foreground active:bg-muted/50 transition-colors"
                      >
                        + <span className="truncate max-w-[20ch] inline-block align-bottom">{food.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Food items */}
          <div className="space-y-2.5">
            {foods.map((food, idx) => (
              <div key={idx} className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                {/* Food header */}
                <div className="flex items-center gap-2 p-3 pb-2">
                  <div className="flex-1 min-w-0">
                    <FoodNameInput
                      value={food.name}
                      onChange={val => updateFood(idx, 'name', val)}
                      onFoodSelect={selected => {
                        const normalized = migrateLegacyFood(selected as any)
                        setFoods(prev => prev.map((f, i) => i === idx ? normalized : f))
                      }}
                      recentFoods={recentFoods}
                    />
                  </div>
                  <button
                    onClick={() => removeFood(idx)}
                    className="size-9 flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg shrink-0 transition-colors -mr-1"
                    aria-label={`Eliminar ${food.name || 'alimento'}`}
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                </div>

                {/* Portion */}
                <div className="px-3 pb-2">
                  <PortionInput
                    amount={food.portionAmount}
                    unit={food.portionUnit}
                    unitWeight={food.unitWeightInGrams}
                    onChange={(amount, unit, unitWeight) => handlePortionChange(idx, amount, unit, unitWeight)}
                    category={food.category}
                    portionNote={food.portionNote}
                  />
                </div>

                {/* Macros row — tap to edit inline */}
                <div className="px-3 py-2 bg-muted/30 border-t border-border/50">
                  <div className="flex items-center gap-1 text-xs">
                    {([
                      { field: 'calories' as const, label: 'kcal', color: 'text-foreground font-medium', suffix: ' kcal', round: true },
                      { field: 'protein' as const, label: 'P', color: 'text-sky-500', suffix: 'g P', round: false },
                      { field: 'carbs' as const, label: 'C', color: 'text-amber-400', suffix: 'g C', round: false },
                      { field: 'fat' as const, label: 'G', color: 'text-pink-500', suffix: 'g G', round: false },
                    ] as const).map(macro => {
                      const isEditing = editingMacro?.index === idx && editingMacro?.field === macro.field
                      const rawVal = Number(food[macro.field]) || 0
                      const displayVal = macro.round ? Math.round(rawVal) : Math.round(rawVal * 10) / 10

                      if (isEditing) {
                        return (
                          <input
                            key={macro.field}
                            type="number"
                            inputMode="decimal"
                            autoFocus
                            defaultValue={displayVal}
                            onBlur={e => {
                              const val = macro.round ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0
                              updateFood(idx, macro.field, val)
                              setFoods(prev => prev.map((f, i) => i === idx ? normalizeToBase100(f) : f))
                              setEditingMacro(null)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              if (e.key === 'Escape') setEditingMacro(null)
                            }}
                            className={cn('w-16 h-8 text-base px-1 rounded-lg border border-lime-400/40 bg-background text-center tabular-nums', macro.color)}
                          />
                        )
                      }

                      return (
                        <button
                          key={macro.field}
                          type="button"
                          onClick={() => setEditingMacro({ index: idx, field: macro.field })}
                          className={cn(
                            'min-h-[36px] px-2 py-1.5 rounded-lg tabular-nums transition-colors',
                            'active:bg-muted/60 active:ring-1 active:ring-border/50',
                            macro.color,
                          )}
                          title={`Editar ${macro.label}`}
                        >
                          {displayVal}{macro.suffix}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* AI meal description */}
          {mealDescription && (
            <div className="px-3 py-2.5 rounded-xl bg-lime-400/5 border border-lime-400/10 text-xs text-muted-foreground leading-relaxed">
              {mealDescription}
            </div>
          )}

          {/* Add food */}
          <button
            onClick={addFood}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] py-3 rounded-xl border border-dashed border-border text-xs font-mono tracking-widest text-muted-foreground hover:border-lime-400/40 hover:text-lime-400 active:bg-lime-400/5 transition-colors"
          >
            <PlusIcon className="size-3.5" />
            AGREGAR ALIMENTO
          </button>

          {/* Total summary */}
          <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] text-muted-foreground tracking-widest uppercase">Total</span>
              <span className="font-bebas text-2xl tabular-nums">{Math.round(totals.calories)} kcal</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-background/50 rounded-lg">
                <div className="font-bebas text-lg text-sky-500 tabular-nums">{Math.round(totals.protein)}g</div>
                <div className="text-[9px] text-muted-foreground tracking-wide">Proteína</div>
              </div>
              <div className="text-center p-2 bg-background/50 rounded-lg">
                <div className="font-bebas text-lg text-amber-400 tabular-nums">{Math.round(totals.carbs)}g</div>
                <div className="text-[9px] text-muted-foreground tracking-wide">Carbos</div>
              </div>
              <div className="text-center p-2 bg-background/50 rounded-lg">
                <div className="font-bebas text-lg text-pink-500 tabular-nums">{Math.round(totals.fat)}g</div>
                <div className="text-[9px] text-muted-foreground tracking-wide">Grasa</div>
              </div>
            </div>
          </div>

          {/* Save as template */}
          {!showSaveTemplate ? (
            <button
              onClick={() => setShowSaveTemplate(true)}
              className="w-full flex items-center justify-center gap-2 min-h-[40px] py-2 text-xs text-muted-foreground tracking-widest hover:text-lime-400 active:text-lime-300 transition-colors"
            >
              <TemplateIcon className="size-3" />
              GUARDAR COMO PLANTILLA
            </button>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Nombre de la plantilla"
                maxLength={100}
                aria-label="Nombre de la plantilla"
                className="flex-1 h-10 text-base px-3 rounded-lg border border-input bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-400/20"
              />
              <Button
                size="sm"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
                className="h-9 bg-lime-400 text-zinc-900 text-[10px] tracking-widest hover:bg-lime-300"
              >
                OK
              </Button>
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="size-9 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg shrink-0"
                aria-label="Cancelar plantilla"
              >
                <CloseIcon className="size-3" />
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400" role="alert">
              {error}
            </div>
          )}

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={foods.length === 0}
            className="w-full h-12 bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas text-lg tracking-widest shadow-lg shadow-lime-400/10"
          >
            GUARDAR COMIDA
          </Button>
        </div>
      )}

      {/* Step: Saving */}
      {step === 'saving' && (
        <div className="py-12 text-center motion-safe:animate-fade-in" role="status">
          <div className="inline-block size-6 border-2 border-lime-400/30 border-t-lime-400 rounded-full animate-spin mb-3" />
          <div className="text-sm text-muted-foreground">Guardando comida...</div>
        </div>
      )}

      {/* Step: Success */}
      {step === 'success' && (
        <div className="py-8 motion-safe:animate-fade-in">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center size-14 rounded-full bg-lime-400/10 border border-lime-400/20 mb-3 motion-safe:animate-scale-in">
              <svg className="size-7 text-lime-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="text-lime-400 font-bebas text-2xl tracking-wide">Comida registrada</div>
          </div>

          {/* Meal summary */}
          <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full uppercase bg-lime-400/10 text-lime-400 border border-lime-400/20">
                {mealLabel}
              </span>
              <span className="font-bebas text-lg tabular-nums">{Math.round(totals.calories)} kcal</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-background/50 rounded-lg">
                <div className="font-bebas text-lg text-sky-500 tabular-nums">{Math.round(totals.protein)}g</div>
                <div className="text-[9px] text-muted-foreground">Proteína</div>
              </div>
              <div className="p-2 bg-background/50 rounded-lg">
                <div className="font-bebas text-lg text-amber-400 tabular-nums">{Math.round(totals.carbs)}g</div>
                <div className="text-[9px] text-muted-foreground">Carbos</div>
              </div>
              <div className="p-2 bg-background/50 rounded-lg">
                <div className="font-bebas text-lg text-pink-500 tabular-nums">{Math.round(totals.fat)}g</div>
                <div className="text-[9px] text-muted-foreground">Grasa</div>
              </div>
            </div>
            {goals && (
              <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
                Llevas {Math.round(dailyTotals.calories)} de {Math.round(goals.dailyCalories)} kcal hoy
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => onSaveSuccess?.()}
              className="flex-1 h-11 bg-lime-400 hover:bg-lime-300 text-zinc-900 font-bebas text-lg tracking-wide"
            >
              LISTO
            </Button>
            <Button
              variant="outline"
              onClick={handleResetForm}
              className="flex-1 h-11 font-bebas text-lg tracking-wide"
            >
              REGISTRAR OTRA
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
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

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function RepeatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  )
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
