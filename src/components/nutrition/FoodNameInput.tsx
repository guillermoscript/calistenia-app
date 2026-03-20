import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '../../lib/utils'
import { Input } from '../ui/input'
import { useFoodCatalog } from '../../hooks/useFoodCatalog'
import { searchCommonFoods } from '../../data/common-foods'
import type { FoodItem } from '../../types'

interface FoodNameInputProps {
  value: string
  onChange: (value: string) => void
  onFoodSelect: (food: FoodItem) => void
  recentFoods?: FoodItem[]
  className?: string
}

interface SectionResult {
  section: 'recientes' | 'catalogo' | 'comunes'
  food: FoodItem
}

export default function FoodNameInput({ value, onChange, onFoodSelect, recentFoods = [], className }: FoodNameInputProps) {
  const [catalogResults, setCatalogResults] = useState<FoodItem[]>([])
  const [commonResults, setCommonResults] = useState<FoodItem[]>([])
  const [recentResults, setRecentResults] = useState<FoodItem[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { searchFoods, lookupWithAI } = useFoodCatalog()

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  // Close dropdown on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const doAILookup = useCallback(async (name: string) => {
    if (!name.trim() || aiLoading) return
    setAiLoading(true)
    setAiError(false)
    setOpen(true)
    try {
      const food = await lookupWithAI(name)
      onFoodSelect(food)
      setOpen(false)
    } catch {
      setAiError(true)
    } finally {
      setAiLoading(false)
    }
  }, [lookupWithAI, onFoodSelect, aiLoading])

  // Instant local search (sync, no debounce)
  const doLocalSearch = useCallback((query: string) => {
    if (query.trim().length < 2) {
      setCommonResults([])
      setRecentResults([])
      return
    }
    const q = query.toLowerCase()

    // Search common foods (sync)
    const common = searchCommonFoods(query).slice(0, 5)
    setCommonResults(common)

    // Filter recents locally
    const filtered = recentFoods
      .filter(f => f.name && f.name.toLowerCase().includes(q))
      .slice(0, 5)
    setRecentResults(filtered)

    if (common.length > 0 || filtered.length > 0) {
      setOpen(true)
    }
  }, [recentFoods])

  // Debounced PocketBase search
  const doCatalogSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setCatalogResults([])
      return
    }
    setSearching(true)
    try {
      const found = await searchFoods(query)
      setCatalogResults(found.slice(0, 8))
      if (found.length > 0) setOpen(true)
    } catch {
      // Catalog search failed silently — local results still available
      setCatalogResults([])
    } finally {
      setSearching(false)
    }
  }, [searchFoods])

  // Trigger searches on value change
  useEffect(() => {
    setAiError(false)
    // Instant local search
    doLocalSearch(value)

    // Debounced catalog search
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doCatalogSearch(value), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasAnyResults = catalogResults.length > 0 || commonResults.length > 0 || recentResults.length > 0
  const showDropdown = open && (hasAnyResults || searching || aiLoading || aiError || value.trim().length >= 2)

  // Deduplicate: catalog names that also appear in common/recent
  const commonNames = new Set(commonResults.map(f => f.name.toLowerCase()))
  const recentNames = new Set(recentResults.map(f => f.name.toLowerCase()))
  const dedupedCatalog = catalogResults.filter(f => !commonNames.has(f.name.toLowerCase()) && !recentNames.has(f.name.toLowerCase()))

  const sections: { key: string; label: string; items: SectionResult[] }[] = []

  if (recentResults.length > 0) {
    sections.push({
      key: 'recientes',
      label: 'RECIENTES',
      items: recentResults.map(f => ({ section: 'recientes', food: f })),
    })
  }
  if (dedupedCatalog.length > 0) {
    sections.push({
      key: 'catalogo',
      label: 'CATALOGO',
      items: dedupedCatalog.map(f => ({ section: 'catalogo', food: f })),
    })
  }
  if (commonResults.length > 0) {
    sections.push({
      key: 'comunes',
      label: 'COMUNES',
      items: commonResults.map(f => ({ section: 'comunes', food: f })),
    })
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Nombre del alimento"
        className={cn('h-8 text-base', className)}
        onFocus={() => { if (hasAnyResults || value.trim().length >= 2) setOpen(true) }}
        maxLength={200}
      />

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border bg-popover shadow-xl overflow-hidden max-h-80 overflow-y-auto overscroll-contain">
          {searching && sections.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              Buscando...
            </div>
          )}

          {sections.map(section => (
            <div key={section.key}>
              {/* Section header */}
              <div className="px-3 py-1.5 text-[9px] font-mono tracking-widest text-muted-foreground/60 uppercase bg-muted/30 border-b border-border/30 sticky top-0 z-10">
                {section.label}
                {section.key === 'catalogo' && searching && (
                  <span className="ml-2 text-muted-foreground/40">...</span>
                )}
              </div>
              {section.items.map((item, i) => (
                <button
                  key={`${section.key}-${i}`}
                  type="button"
                  onClick={() => { onFoodSelect(item.food); setOpen(false) }}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted active:bg-muted transition-colors border-b border-border/20 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-medium text-foreground truncate">{item.food.name}</span>
                    {item.section === 'catalogo' && (
                      <span className="text-[8px] font-mono tracking-wide text-muted-foreground/50 bg-muted px-1 py-0.5 rounded shrink-0">
                        DB
                      </span>
                    )}
                    {item.food.category && (
                      <span className="text-[9px] font-mono tracking-wide text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded-full uppercase shrink-0">
                        {item.food.category}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {item.food.portionAmount}{item.food.portionUnit} · <span className="text-foreground/70">{Math.round(item.food.calories)} kcal</span>
                    {' · '}P {Math.round((item.food.protein ?? 0) * 10) / 10}g · C {Math.round((item.food.carbs ?? 0) * 10) / 10}g · G {Math.round((item.food.fat ?? 0) * 10) / 10}g
                  </div>
                </button>
              ))}
            </div>
          ))}

          {/* AI error message */}
          {aiError && !aiLoading && (
            <div className="px-3 py-2.5 border-t border-border/40 text-xs text-red-400 flex items-center justify-between gap-2">
              <span>No se pudo buscar con IA</span>
              <button
                type="button"
                onClick={() => doAILookup(value)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-red-400/10 text-red-400 text-xs active:bg-red-400/20 transition-colors"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* AI lookup button - always at bottom */}
          {value.trim().length >= 2 && !aiLoading && !aiError && (
            <button
              type="button"
              onClick={() => doAILookup(value)}
              className="w-full min-h-[44px] py-2.5 px-3 border-t border-border/40 bg-muted/20 text-xs font-mono tracking-wide text-lime-400 hover:bg-lime-400/10 active:bg-lime-400/15 transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-[11px]">&#9733;</span>
              Buscar con IA
            </button>
          )}

          {aiLoading && (
            <div className="px-3 py-3 flex items-center gap-2.5 border-t border-border/40">
              <div className="flex gap-1">
                <div className="size-1.5 rounded-full bg-lime-400 animate-bounce [animation-delay:0ms]" />
                <div className="size-1.5 rounded-full bg-lime-400 animate-bounce [animation-delay:150ms]" />
                <div className="size-1.5 rounded-full bg-lime-400 animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-muted-foreground truncate">
                Buscando valores para &quot;{value}&quot;...
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
