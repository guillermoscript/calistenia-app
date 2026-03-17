import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '../../lib/utils'
import { Input } from '../ui/input'
import { useFoodCatalog } from '../../hooks/useFoodCatalog'
import type { FoodItem } from '../../types'

const LS_AUTO_AI = 'calistenia_food_auto_ai'

interface FoodNameInputProps {
  value: string
  onChange: (value: string) => void
  onFoodSelect: (food: FoodItem) => void
  className?: string
}

export default function FoodNameInput({ value, onChange, onFoodSelect, className }: FoodNameInputProps) {
  const [results, setResults] = useState<FoodItem[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [noResults, setNoResults] = useState(false)
  const [autoAI, setAutoAI] = useState(() => localStorage.getItem(LS_AUTO_AI) === 'true')
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { searchFoods, lookupWithAI } = useFoodCatalog()

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const doAILookup = useCallback(async (name: string) => {
    if (!name.trim()) return
    setAiLoading(true)
    setOpen(true)
    try {
      const food = await lookupWithAI(name)
      onFoodSelect(food)
      setOpen(false)
      setNoResults(false)
    } catch {
      // keep dropdown open so user can retry manually
    } finally {
      setAiLoading(false)
    }
  }, [lookupWithAI, onFoodSelect])

  const doSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResults([])
      setNoResults(false)
      setOpen(false)
      return
    }
    setSearching(true)
    const found = await searchFoods(query)
    setSearching(false)
    setResults(found)
    const hasNoResults = found.length === 0
    setNoResults(hasNoResults)
    setOpen(true)
    if (hasNoResults && autoAI) {
      doAILookup(query)
    }
  }, [searchFoods, autoAI, doAILookup])

  // Debounce search on value change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAutoAI = () => {
    setAutoAI(prev => {
      const next = !prev
      localStorage.setItem(LS_AUTO_AI, String(next))
      return next
    })
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Nombre del alimento"
          className={cn('h-8 text-sm', className)}
          onFocus={() => { if (results.length > 0 || noResults) setOpen(true) }}
        />
        {/* Auto-AI toggle */}
        <button
          type="button"
          onClick={toggleAutoAI}
          title={autoAI ? 'IA automática activa — click para desactivar' : 'IA manual — click para activar IA automática'}
          className={cn(
            'shrink-0 h-8 w-9 rounded-md border flex items-center justify-center transition-colors text-[9px] font-mono tracking-wide',
            autoAI
              ? 'border-lime-400/50 bg-lime-400/10 text-lime-400'
              : 'border-border text-muted-foreground hover:border-muted-foreground/60'
          )}
        >
          IA
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
          {searching && (
            <div className="px-3 py-2.5 text-[11px] text-muted-foreground">
              Buscando...
            </div>
          )}

          {!searching && results.length > 0 && results.map((food, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { onFoodSelect(food); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border/40 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-foreground">{food.name}</span>
                {food.category && (
                  <span className="text-[9px] font-mono tracking-wide text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded-full uppercase">
                    {food.category}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {food.portion} · <span className="text-foreground/70">{food.calories} kcal</span>
                {' · '}P {food.protein}g · C {food.carbs}g · G {food.fat}g
              </div>
            </button>
          ))}

          {!searching && noResults && !aiLoading && (
            <div className="px-3 py-2.5 space-y-2">
              <div className="text-[11px] text-muted-foreground">
                No encontrado en el catálogo
              </div>
              {!autoAI && (
                <button
                  type="button"
                  onClick={() => doAILookup(value)}
                  className="w-full py-1.5 px-3 rounded-md bg-lime-400/10 border border-lime-400/30 text-lime-400 text-[11px] font-mono tracking-wide hover:bg-lime-400/20 transition-colors"
                >
                  Buscar con IA
                </button>
              )}
            </div>
          )}

          {aiLoading && (
            <div className="px-3 py-3 flex items-center gap-2.5">
              <div className="flex gap-1">
                <div className="size-1.5 rounded-full bg-lime-400 animate-bounce [animation-delay:0ms]" />
                <div className="size-1.5 rounded-full bg-lime-400 animate-bounce [animation-delay:150ms]" />
                <div className="size-1.5 rounded-full bg-lime-400 animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-[11px] text-muted-foreground">
                Buscando valores para "{value}"...
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
