import { useState } from 'react'
import { cn } from '../../lib/utils'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import MacroBar from './MacroBar'
import { MEAL_TYPE_COLORS } from '../../lib/style-tokens'
import type { NutritionEntry } from '../../types'

interface NutritionDashboardProps {
  dailyTotals: { calories: number; protein: number; carbs: number; fat: number }
  goals: { dailyCalories: number; dailyProtein: number; dailyCarbs: number; dailyFat: number } | null
  entries: NutritionEntry[]
  onDeleteEntry?: (id: string) => void
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
        {/* Background ring */}
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth="10"
        />
        {/* Progress ring */}
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

export default function NutritionDashboard({ dailyTotals, goals, entries, onDeleteEntry }: NutritionDashboardProps) {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  if (!goals) return null

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Calorie gauge + macros */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <CalorieGauge consumed={dailyTotals.calories} target={goals.dailyCalories} />
            <div className="flex-1 w-full space-y-3">
              <MacroBar label="Proteína" current={dailyTotals.protein} target={goals.dailyProtein} color="bg-sky-500" />
              <MacroBar label="Carbos" current={dailyTotals.carbs} target={goals.dailyCarbs} color="bg-amber-400" />
              <MacroBar label="Grasa" current={dailyTotals.fat} target={goals.dailyFat} color="bg-pink-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meal timeline */}
      <div>
        <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-3 uppercase">Comidas de hoy</div>
        {entries.length === 0 ? ((() => {
          const hour = new Date().getHours()
          const emptyPrompt = hour < 10 ? '¿Qué desayunaste hoy?' : hour < 15 ? '¿Ya almorzaste?' : '¿Qué comiste hoy?'
          return (
            <Card>
              <CardContent className="p-5 text-center">
                <div className="text-muted-foreground text-sm">{emptyPrompt}</div>
                <div className="text-xs text-muted-foreground mt-1">Usa el botón + para registrar</div>
              </CardContent>
            </Card>
          )
        })()
        ) : (
          <div className="space-y-3">
            {entries.map((entry, idx) => {
              const mealInfo = MEAL_TYPE_COLORS[entry.mealType] || MEAL_TYPE_COLORS.snack
              const entryId = entry.id || `entry-${idx}`
              const isExpanded = expandedEntry === entryId
              return (
                <Card key={entryId} className="overflow-hidden transition-all duration-300">
                  <CardContent className="p-0">
                    <button
                      onClick={() => setExpandedEntry(isExpanded ? null : entryId)}
                      className="w-full p-4 text-left"
                      aria-expanded={isExpanded}
                      aria-label={`${mealInfo.label} - ${Math.round(entry.totalCalories)} kcal`}
                    >
                      <div className="flex gap-3">
                        {/* Photo thumbnail */}
                        {((entry.photoUrls && entry.photoUrls.length > 0) || entry.photoUrl) && (
                          <div className="shrink-0 size-14 rounded-lg overflow-hidden bg-muted relative">
                            <img
                              src={(entry.photoUrls?.[0]) || entry.photoUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {entry.photoUrls && entry.photoUrls.length > 1 && (
                              <div className="absolute bottom-0.5 right-0.5 text-[8px] font-mono text-white bg-black/60 backdrop-blur-sm px-1 rounded">
                                +{entry.photoUrls.length - 1}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className={cn(
                              'text-[9px] tracking-widest px-2 py-0.5 rounded border',
                              mealInfo.bg, mealInfo.color
                            )}>
                              {mealInfo.label.toUpperCase()}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatTime(entry.loggedAt)}</span>
                            <span className="ml-auto font-bebas text-lg text-foreground">{Math.round(entry.totalCalories)} kcal</span>
                          </div>
                          {(() => {
                            const foodNames = entry.foods.map(f => f.name).filter(Boolean)
                            const summary = foodNames.length > 0
                              ? foodNames.join(', ')
                              : `${entry.foods.length} alimento${entry.foods.length !== 1 ? 's' : ''}`
                            return (
                              <div className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                                {summary}
                              </div>
                            )
                          })()}
                          <div className="flex gap-3 mt-1.5 text-[10px]">
                            <span className="text-sky-500">{Math.round(entry.totalProtein)}g prot</span>
                            <span className="text-amber-400">{Math.round(entry.totalCarbs)}g carbs</span>
                            <span className="text-pink-500">{Math.round(entry.totalFat)}g grasa</span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border">
                        {/* Photo gallery */}
                        {entry.photoUrls && entry.photoUrls.length > 0 && (
                          <div className="flex gap-2 pt-3 pb-2 overflow-x-auto scrollbar-none -mx-1 px-1">
                            {entry.photoUrls.map((url, pi) => (
                              <img
                                key={pi}
                                src={url}
                                alt={`Foto ${pi + 1}`}
                                className="shrink-0 h-28 rounded-lg object-cover"
                                loading="lazy"
                              />
                            ))}
                          </div>
                        )}
                        <div className="pt-3 space-y-2">
                          {entry.foods.map((food, fi) => (
                            <div key={fi} className="flex items-center gap-3 text-xs">
                              <span className="flex-1 text-foreground">{food.name || 'Sin nombre'}</span>
                              <span className="text-muted-foreground">{(food as any).portionAmount ?? ''}{(food as any).portionUnit ?? (food as any).portion ?? ''}</span>
                              <span className="text-sky-500 w-12 text-right">{food.protein}p</span>
                              <span className="text-amber-400 w-12 text-right">{food.carbs}c</span>
                              <span className="text-pink-500 w-12 text-right">{food.fat}g</span>
                              <span className="text-foreground w-14 text-right">{food.calories} kcal</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                          <div className="flex gap-4 text-xs">
                            <span className="text-sky-500">{Math.round(entry.totalProtein)}g prot</span>
                            <span className="text-amber-400">{Math.round(entry.totalCarbs)}g carbs</span>
                            <span className="text-pink-500">{Math.round(entry.totalFat)}g grasa</span>
                          </div>
                          {onDeleteEntry && entry.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(entry.id!) }}
                              className="h-7 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                            >
                              <TrashIcon className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
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
    </div>
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
