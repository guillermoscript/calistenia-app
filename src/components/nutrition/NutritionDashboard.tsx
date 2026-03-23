import { useState } from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import EditMealSheet from './EditMealSheet'
import MacroBar from './MacroBar'
import { MEAL_TYPE_COLORS } from '../../lib/style-tokens'
import type { NutritionEntry } from '../../types'

interface NutritionDashboardProps {
  dailyTotals: { calories: number; protein: number; carbs: number; fat: number }
  goals: { dailyCalories: number; dailyProtein: number; dailyCarbs: number; dailyFat: number } | null
  entries: NutritionEntry[]
  onDeleteEntry?: (id: string) => void
  onEditEntry?: (id: string, data: Partial<NutritionEntry>) => Promise<void>
  onDuplicateEntry?: (entry: NutritionEntry) => void
  selectedDate?: string
}


function CalorieGauge({ consumed, target }: { consumed: number; target: number }) {
  const pct = target > 0 ? Math.min(consumed / target, 1.2) : 0
  const clampedPct = Math.min(pct, 1)
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - clampedPct)
  const overBudget = consumed > target

  return (
    <div className="relative flex items-center justify-center" role="img" aria-label={`${Math.round(consumed)} de ${target} calorías consumidas`}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth="10"
        />
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          stroke="currentColor"
          className={cn(
            overBudget ? 'text-red-500' : pct >= 0.8 ? 'text-amber-400' : 'text-lime'
          )}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn(
          'font-bebas text-3xl leading-none',
          overBudget ? 'text-red-500' : 'text-foreground'
        )}>
          {Math.round(consumed)}
        </span>
        <span className="text-[10px] text-muted-foreground tracking-widest">
          / {target} kcal
        </span>
      </div>
    </div>
  )
}

export default function NutritionDashboard({ dailyTotals, goals, entries, onDeleteEntry, onEditEntry, onDuplicateEntry, selectedDate }: NutritionDashboardProps) {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<NutritionEntry | null>(null)

  if (!goals) return null

  const isToday = !selectedDate || selectedDate === new Date().toISOString().split('T')[0]

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  // Scale visual weight by calories relative to goal
  const maxCal = goals.dailyCalories * 0.5 // a single meal > 50% of goal is "large"
  const getEntryWeight = (cal: number) => {
    if (cal >= maxCal) return 'large'
    if (cal >= maxCal * 0.4) return 'medium'
    return 'small'
  }

  return (
    <div className="space-y-6">
      {/* Calorie gauge + macros */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <CalorieGauge consumed={dailyTotals.calories} target={goals.dailyCalories} />
          <div className="flex-1 w-full space-y-3">
            <MacroBar label="Proteína" current={dailyTotals.protein} target={goals.dailyProtein} color="bg-sky-500" />
            <MacroBar label="Carbos" current={dailyTotals.carbs} target={goals.dailyCarbs} color="bg-amber-400" />
            <MacroBar label="Grasa" current={dailyTotals.fat} target={goals.dailyFat} color="bg-pink-500" />
          </div>
        </div>
      </div>

      {/* Meal timeline */}
      <div>
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">
          {isToday ? 'Comidas de hoy' : 'Comidas del día'}
        </div>
        {entries.length === 0 ? ((() => {
          const hour = new Date().getHours()
          const emptyPrompt = isToday
            ? (hour < 10 ? '¿Qué desayunaste hoy?' : hour < 15 ? '¿Ya almorzaste?' : '¿Qué comiste hoy?')
            : 'Sin registros este día'
          return (
            <div className="py-8 text-center">
              <div className="text-muted-foreground text-sm">{emptyPrompt}</div>
              {isToday && <div className="text-xs text-muted-foreground/60 mt-1">Usa el botón + para registrar</div>}
            </div>
          )
        })()
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-1">
              {entries.map((entry, idx) => {
                const mealInfo = MEAL_TYPE_COLORS[entry.mealType] || MEAL_TYPE_COLORS.snack
                const entryId = entry.id || `entry-${idx}`
                const isExpanded = expandedEntry === entryId
                const weight = getEntryWeight(entry.totalCalories)

                return (
                  <div key={entryId} className="relative">
                    {/* Timeline dot */}
                    <div className={cn(
                      'absolute left-[14px] top-4 rounded-full border-2 border-background z-10',
                      weight === 'large' ? 'size-[10px]' : 'size-2',
                      mealInfo.color.replace('text-', 'bg-'),
                    )} />

                    <div className={cn(
                      'ml-10 rounded-lg transition-all duration-200',
                      weight === 'large' && 'bg-card border border-border',
                      weight === 'medium' && 'hover:bg-card/50',
                    )}>
                      <div className={cn(
                        'flex items-center gap-3',
                        weight === 'large' ? 'p-4' : weight === 'medium' ? 'px-3 py-3' : 'px-3 py-2',
                      )}>
                        {/* Photo thumbnail — only for large entries */}
                        {weight === 'large' && entry.photoUrls && entry.photoUrls.length > 0 && (
                          <button
                            onClick={() => setExpandedEntry(isExpanded ? null : entryId)}
                            className="shrink-0 size-12 rounded-lg overflow-hidden bg-muted relative"
                          >
                            <img
                              src={entry.photoUrls[0]}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {entry.photoUrls && entry.photoUrls.length > 1 && (
                              <div className="absolute bottom-0 right-0 text-[8px] font-mono text-white bg-black/60 px-1 rounded-tl">
                                +{entry.photoUrls.length - 1}
                              </div>
                            )}
                          </button>
                        )}

                        {/* Content — click to expand */}
                        <button
                          onClick={() => setExpandedEntry(isExpanded ? null : entryId)}
                          className="flex-1 min-w-0 text-left"
                          aria-expanded={isExpanded}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'text-[9px] tracking-widest',
                              mealInfo.color,
                            )}>
                              {mealInfo.label.toUpperCase()}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60">{formatTime(entry.loggedAt)}</span>
                            <span className={cn(
                              'ml-auto tabular-nums',
                              weight === 'large' ? 'font-bebas text-xl text-foreground' : 'text-xs text-foreground font-medium',
                            )}>
                              {Math.round(entry.totalCalories)}
                              <span className={weight === 'large' ? 'text-sm text-muted-foreground ml-0.5' : 'text-muted-foreground ml-0.5'}>kcal</span>
                            </span>
                          </div>

                          {/* Food names — only for medium/large, with x2/x3 for repeated items */}
                          {weight !== 'small' && (() => {
                            const counts = new Map<string, number>()
                            for (const f of entry.foods) {
                              if (!f.name) continue
                              counts.set(f.name, (counts.get(f.name) || 0) + 1)
                            }
                            const parts: string[] = []
                            for (const [name, count] of counts) {
                              parts.push(count > 1 ? `${name} x${count}` : name)
                            }
                            const summary = parts.length > 0
                              ? parts.join(', ')
                              : `${entry.foods.length} alimento${entry.foods.length !== 1 ? 's' : ''}`
                            return (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{summary}</div>
                            )
                          })()}

                          {/* Macros row */}
                          <div className={cn(
                            'flex gap-3 text-[10px]',
                            weight === 'large' ? 'mt-2' : 'mt-1',
                          )}>
                            <span className="text-sky-500">{Math.round(entry.totalProtein)}g P</span>
                            <span className="text-amber-400">{Math.round(entry.totalCarbs)}g C</span>
                            <span className="text-pink-500">{Math.round(entry.totalFat)}g G</span>
                          </div>
                        </button>

                        {/* Actions */}
                        {entry.id && (
                          <div className="flex gap-0.5 shrink-0 self-start">
                            {onDuplicateEntry && (
                              <button
                                onClick={() => onDuplicateEntry(entry)}
                                className="size-8 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-lime hover:bg-lime/10 transition-colors"
                                aria-label="Duplicar"
                              >
                                <CopyIcon className="size-3.5" />
                              </button>
                            )}
                            {onEditEntry && (
                              <button
                                onClick={() => setEditingEntry(entry)}
                                className="size-8 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                                aria-label="Editar"
                              >
                                <EditIcon className="size-3.5" />
                              </button>
                            )}
                            {onDeleteEntry && (
                              <button
                                onClick={() => setDeleteConfirmId(entry.id!)}
                                className="size-8 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                aria-label="Eliminar"
                              >
                                <TrashIcon className="size-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Expanded detail — only per-food breakdown (no repeated totals) */}
                      {isExpanded && (
                        <div className={cn(
                          'border-t border-border/50',
                          weight === 'large' ? 'px-4 pb-4' : 'px-3 pb-3',
                        )}>
                          {/* Photo gallery */}
                          {(() => {
                            const photos = entry.photoUrls ?? []
                            if (photos.length === 0) return null
                            return (
                              <div className="flex gap-2 pt-3 pb-2 overflow-x-auto scrollbar-none -mx-1 px-1">
                                {photos.map((url, pi) => (
                                  <img
                                    key={pi}
                                    src={url}
                                    alt={`Foto ${pi + 1}`}
                                    className="shrink-0 h-28 rounded-lg object-cover"
                                    loading="lazy"
                                  />
                                ))}
                              </div>
                            )
                          })()}
                          <div className="pt-3 space-y-1.5">
                            {(() => {
                              // Group foods by name to show x2, x3 with aggregated macros
                              const grouped: { food: typeof entry.foods[0]; count: number }[] = []
                              for (const food of entry.foods) {
                                const existing = grouped.find(g => g.food.name === food.name && food.name)
                                if (existing) {
                                  existing.count++
                                } else {
                                  grouped.push({ food, count: 1 })
                                }
                              }
                              return grouped.map((g, fi) => (
                                <div key={fi} className="flex items-center gap-2 text-xs">
                                  <span className="flex-1 text-foreground/80">
                                    {g.food.name || 'Sin nombre'}
                                    {g.count > 1 && <span className="text-lime ml-1 font-medium">x{g.count}</span>}
                                  </span>
                                  <span className="text-muted-foreground/60 text-[10px]">{(g.food as any).portionAmount ?? ''}{(g.food as any).portionUnit ?? (g.food as any).portion ?? ''}</span>
                                  <span className="text-muted-foreground w-14 text-right tabular-nums">{Math.round(g.food.calories * g.count)} kcal</span>
                                </div>
                              ))
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {onDeleteEntry && (
        <ConfirmDialog
          open={deleteConfirmId !== null}
          onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}
          title="Eliminar comida"
          description="¿Eliminar este registro de comida?"
          confirmLabel="ELIMINAR"
          cancelLabel="CANCELAR"
          variant="destructive"
          onConfirm={() => {
            if (deleteConfirmId) onDeleteEntry(deleteConfirmId)
          }}
        />
      )}

      {onEditEntry && (
        <EditMealSheet
          entry={editingEntry}
          open={editingEntry !== null}
          onOpenChange={(open) => { if (!open) setEditingEntry(null) }}
          onSave={onEditEntry}
        />
      )}
    </div>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11.33 2a1.89 1.89 0 012.67 2.67L5.33 13.33 2 14l.67-3.33L11.33 2z" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V3a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 3v6A1.5 1.5 0 003 10.5h2.5" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M6.67 7.33v4M9.33 7.33v4" />
      <path d="M3.33 4h9.34l-.67 9.33a1.33 1.33 0 01-1.33 1.34H5.33A1.33 1.33 0 014 13.33L3.33 4z" />
    </svg>
  )
}
