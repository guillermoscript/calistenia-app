import { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { Input } from '../ui/input'
import { useFoodCatalog } from '../../hooks/useFoodCatalog'
import { isIncompleteFood } from '../../lib/openfoodfacts'
import type { FoodItem } from '../../types'

interface FoodNameInputProps {
  value: string
  onChange: (value: string) => void
  onFoodSelect: (food: FoodItem) => void
  recentFoods?: FoodItem[]
  className?: string
}

type OptionItem =
  | { type: 'food'; section: 'recientes' | 'catalogo'; food: FoodItem }
  | { type: 'off'; food: FoodItem & { imageUrl?: string } }
  | { type: 'ai' }

export default function FoodNameInput({ value, onChange, onFoodSelect, recentFoods = [], className }: FoodNameInputProps) {
  const { t } = useTranslation()
  const [catalogResults, setCatalogResults] = useState<FoodItem[]>([])
  const [recentResults, setRecentResults] = useState<FoodItem[]>([])
  const [offResults, setOffResults] = useState<(FoodItem & { imageUrl?: string })[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [completingName, setCompletingName] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { searchFoods, lookupWithAI, completeWithAI } = useFoodCatalog()
  const listboxId = useId()

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

  // Instant local search for recents (sync, no debounce)
  const doRecentSearch = useCallback((query: string) => {
    if (query.trim().length < 2) {
      setRecentResults([])
      return
    }
    const q = query.toLowerCase()
    const filtered = recentFoods
      .filter(f => f.name && f.name.toLowerCase().includes(q))
      .slice(0, 5)
    setRecentResults(filtered)
    if (filtered.length > 0) setOpen(true)
  }, [recentFoods])

  // Debounced unified search (PB + OFF in single call)
  const doSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setCatalogResults([])
      setOffResults([])
      return
    }
    setSearching(true)
    try {
      const { catalog, off } = await searchFoods(query)
      setCatalogResults(catalog)
      setOffResults(off)
      if (catalog.length > 0 || off.length > 0) setOpen(true)
    } catch {
      setCatalogResults([])
      setOffResults([])
    } finally {
      setSearching(false)
    }
  }, [searchFoods])

  /** Select an OFF food — if incomplete, auto-complete with AI then select */
  const handleOffSelect = useCallback(async (food: FoodItem & { imageUrl?: string }) => {
    if (isIncompleteFood(food)) {
      setCompletingName(food.name)
      setOpen(true)
      try {
        const completed = await completeWithAI(food)
        onFoodSelect(completed)
      } catch {
        onFoodSelect(food)
      } finally {
        setCompletingName(null)
        setOpen(false)
      }
    } else {
      onFoodSelect(food)
      setOpen(false)
    }
  }, [completeWithAI, onFoodSelect])

  // Trigger searches on value change
  useEffect(() => {
    setAiError(false)
    setActiveIndex(-1)
    doRecentSearch(value)

    // Single debounced search for catalog + OFF
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasAnyResults = catalogResults.length > 0 || recentResults.length > 0 || offResults.length > 0
  const showDropdown = open && (hasAnyResults || searching || aiLoading || aiError || value.trim().length >= 2)

  // Deduplicate — memoized to avoid recalculating on every render
  const { dedupedCatalog, dedupedOff } = useMemo(() => {
    const recentNames = new Set(recentResults.map(f => f.name.toLowerCase()))
    const catalog = catalogResults.filter(f => !recentNames.has(f.name.toLowerCase()))
    const allOtherNames = new Set([
      ...recentResults.map(f => f.name.toLowerCase()),
      ...catalogResults.map(f => f.name.toLowerCase()),
    ])
    const off = offResults.filter(f => !allOtherNames.has(f.name.toLowerCase()))
    return { dedupedCatalog: catalog, dedupedOff: off }
  }, [recentResults, catalogResults, offResults])

  // Build flat list of all navigable options for keyboard nav
  const flatOptions = useMemo<OptionItem[]>(() => {
    const items: OptionItem[] = []
    for (const f of recentResults) items.push({ type: 'food', section: 'recientes', food: f })
    for (const f of dedupedCatalog) items.push({ type: 'food', section: 'catalogo', food: f })
    for (const f of dedupedOff) items.push({ type: 'off', food: f })
    if (value.trim().length >= 2 && !aiLoading && !aiError) items.push({ type: 'ai' })
    return items
  }, [recentResults, dedupedCatalog, dedupedOff, value, aiLoading, aiError])

  // Select the active option
  const selectOption = useCallback((option: OptionItem) => {
    if (option.type === 'food') {
      onFoodSelect(option.food)
      setOpen(false)
    } else if (option.type === 'off') {
      handleOffSelect(option.food)
    } else if (option.type === 'ai') {
      doAILookup(value)
    }
  }, [onFoodSelect, handleOffSelect, doAILookup, value])

  // Scroll active option into view
  useEffect(() => {
    if (activeIndex < 0 || !listboxRef.current) return
    const el = listboxRef.current.querySelector(`[data-option-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      e.preventDefault()
      return
    }
    if (!open) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(prev => (prev + 1) % flatOptions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(prev => (prev <= 0 ? flatOptions.length - 1 : prev - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < flatOptions.length) {
          selectOption(flatOptions[activeIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
        break
    }
  }, [open, flatOptions, activeIndex, selectOption])

  // Track which flat index we're on for rendering
  let optionIndex = 0

  // Section structures for rendering
  const sections: { key: string; label: string; items: { section: 'recientes' | 'catalogo'; food: FoodItem }[] }[] = []

  if (recentResults.length > 0) {
    sections.push({
      key: 'recientes',
      label: t('nutrition.recent'),
      items: recentResults.map(f => ({ section: 'recientes' as const, food: f })),
    })
  }
  if (dedupedCatalog.length > 0) {
    sections.push({
      key: 'catalogo',
      label: t('nutrition.saved'),
      items: dedupedCatalog.map(f => ({ section: 'catalogo' as const, food: f })),
    })
  }

  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('nutrition.foodNamePlaceholder')}
        className={cn('h-8 text-base', className)}
        onFocus={() => { if (hasAnyResults || value.trim().length >= 2) setOpen(true) }}
        maxLength={200}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        aria-label={t('nutrition.searchFood')}
      />

      {/* Dropdown */}
      {showDropdown && (
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={t('nutrition.searchResults')}
          className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-border bg-popover shadow-xl overflow-hidden max-h-80 overflow-y-auto overscroll-contain motion-safe:animate-slide-down"
        >
          {searching && sections.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground" role="status">
              {t('common.searching')}
            </div>
          )}

          {sections.map(section => (
            <div key={section.key} role="group" aria-label={section.label}>
              {/* Section header */}
              <div className="px-3 py-1.5 text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase bg-muted/30 border-b border-border/30 sticky top-0 z-10" role="presentation">
                {section.label}
                {section.key === 'catalogo' && searching && (
                  <span className="ml-2 text-muted-foreground/40">...</span>
                )}
              </div>
              {section.items.map((item, i) => {
                const idx = optionIndex++
                return (
                  <div
                    key={`${section.key}-${i}`}
                    id={`${listboxId}-option-${idx}`}
                    role="option"
                    aria-selected={activeIndex === idx}
                    data-option-index={idx}
                    onClick={() => { onFoodSelect(item.food); setOpen(false) }}
                    onPointerMove={() => setActiveIndex(idx)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 cursor-pointer transition-colors border-b border-border/20 last:border-0',
                      activeIndex === idx ? 'bg-muted' : 'hover:bg-muted',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-medium text-foreground truncate">{item.food.name}</span>
                      {item.section === 'catalogo' && (
                        <span className="text-[8px] font-mono tracking-wide text-lime-400/50 bg-lime-400/10 px-1 py-0.5 rounded shrink-0">
                          ✓
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
                  </div>
                )
              })}
            </div>
          ))}

          {/* Open Food Facts section with thumbnails */}
          {dedupedOff.length > 0 && (
            <div role="group" aria-label="Open Food Facts">
              <div className="px-3 py-1.5 text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase bg-muted/30 border-b border-border/30 sticky top-0 z-10" role="presentation">
                OPEN FOOD FACTS
              </div>
              {dedupedOff.map((item, i) => {
                const idx = optionIndex++
                const incomplete = isIncompleteFood(item)
                const isCompleting = completingName === item.name
                return (
                  <div
                    key={`off-${i}`}
                    id={`${listboxId}-option-${idx}`}
                    role="option"
                    aria-selected={activeIndex === idx}
                    data-option-index={idx}
                    onClick={() => !isCompleting && handleOffSelect(item)}
                    onPointerMove={() => setActiveIndex(idx)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 cursor-pointer transition-colors border-b border-border/20 last:border-0',
                      isCompleting
                        ? 'bg-lime-400/5 border-lime-400/20'
                        : activeIndex === idx ? 'bg-muted' : 'hover:bg-muted',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className={cn(
                            'size-6 rounded object-cover shrink-0 transition-opacity',
                            isCompleting && 'opacity-50',
                          )}
                        />
                      )}
                      <span className={cn(
                        'text-[13px] font-medium truncate transition-colors',
                        isCompleting ? 'text-lime-400' : 'text-foreground',
                      )}>
                        {item.name}
                      </span>
                      {isCompleting ? (
                        <div className="size-3.5 border-[1.5px] border-lime-400/30 border-t-lime-400 rounded-full animate-spin shrink-0" />
                      ) : incomplete ? (
                        <span className="text-[8px] font-mono tracking-wide text-amber-400/70 bg-amber-400/10 px-1 py-0.5 rounded shrink-0">
                          IA
                        </span>
                      ) : (
                        <span className="text-[8px] font-mono tracking-wide text-orange-400/70 bg-orange-400/10 px-1 py-0.5 rounded shrink-0">
                          OFF
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {isCompleting ? (
                        <span className="text-lime-400/70">{t('nutrition.calculatingMacros')}</span>
                      ) : incomplete ? (
                        <span className="text-amber-400/70">{t('nutrition.macrosEstimatedByAI')}</span>
                      ) : (
                        <>
                          {item.portionAmount}{item.portionUnit} · <span className="text-foreground/70">{Math.round(item.calories)} kcal</span>
                          {' · '}P {Math.round((item.protein ?? 0) * 10) / 10}g · C {Math.round((item.carbs ?? 0) * 10) / 10}g · G {Math.round((item.fat ?? 0) * 10) / 10}g
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* AI error message */}
          {aiError && !aiLoading && (
            <div className="px-3 py-2.5 border-t border-border/40 text-xs text-red-400 flex items-center justify-between gap-2" role="alert">
              <span>{t('nutrition.aiSearchFailed')}</span>
              <button
                type="button"
                onClick={() => doAILookup(value)}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-red-400/10 text-red-400 text-xs active:bg-red-400/20 transition-colors"
              >
                {t('nutrition.retry')}
              </button>
            </div>
          )}

          {/* AI lookup button - always at bottom */}
          {value.trim().length >= 2 && !aiLoading && !aiError && (() => {
            const idx = optionIndex++
            return (
              <div
                id={`${listboxId}-option-${idx}`}
                role="option"
                aria-selected={activeIndex === idx}
                data-option-index={idx}
                onClick={() => doAILookup(value)}
                onPointerMove={() => setActiveIndex(idx)}
                className={cn(
                  'w-full min-h-[44px] py-2.5 px-3 border-t border-border/40 text-xs font-mono tracking-wide text-lime-400 cursor-pointer transition-colors flex items-center justify-center gap-2',
                  activeIndex === idx ? 'bg-lime-400/15' : 'bg-muted/20 hover:bg-lime-400/10',
                )}
              >
                <span className="text-[11px]" aria-hidden="true">&#9733;</span>
                {t('nutrition.searchWithAI')}
              </div>
            )
          })()}

          {aiLoading && (
            <div className="px-3 py-3 flex items-center gap-2.5 border-t border-border/40" role="status" aria-label="Buscando con IA">
              <div className="flex gap-1.5" aria-hidden="true">
                <div className="size-1.5 rounded-full bg-lime-400 motion-safe:animate-dot-pulse [animation-delay:0ms]" />
                <div className="size-1.5 rounded-full bg-lime-400 motion-safe:animate-dot-pulse [animation-delay:200ms]" />
                <div className="size-1.5 rounded-full bg-lime-400 motion-safe:animate-dot-pulse [animation-delay:400ms]" />
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {t('nutrition.calculatingMacrosFor', { name: value })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
