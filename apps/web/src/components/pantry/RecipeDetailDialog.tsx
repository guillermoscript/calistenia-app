/**
 * Dialog de detalle de receta de un plan pantry-aware (#171) — versión web.
 * La receta viaja por props (no persiste ni tiene ruta propia); la foto se
 * busca en TheMealDB (gratis) con el photo_query en inglés del LLM.
 * Puerto 1:1 de apps/mobile/src/app/recipe-detail.tsx, adaptado a Dialog shadcn
 * (en mobile es una ruta con back nativo; acá el X del Dialog cumple ese rol).
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { usePantryItems } from '@calistenia/core/hooks/usePantry'
import { useSavedRecipes, useToggleSavedRecipe } from '@calistenia/core/hooks/useSavedRecipes'
import { computeRecipeCost, formatMoney } from '@calistenia/core/lib/shopping'
import { normalizePantryName } from '@calistenia/core/lib/pantry'
import { MAX_SERVINGS, fetchMealMedia, scaleQty } from '@calistenia/core/lib/recipe-media'
import type { MealMedia } from '@calistenia/core/lib/recipe-media'
import type { Recipe } from '@calistenia/core/types'
import { cn } from '../../lib/utils'

interface RecipeDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  recipe: Recipe | null
  userId: string | null
}

export function RecipeDetailDialog({ open, onOpenChange, label, recipe, userId }: RecipeDetailDialogProps) {
  const { t } = useTranslation()

  const baseServings = Math.max(1, recipe?.servings ?? 1)
  const [servings, setServings] = useState(baseServings)
  const [showBreakdown, setShowBreakdown] = useState(false)
  // El Dialog no se remonta entre aperturas (una sola instancia reutilizada por
  // el caller): resetear estado local cuando se abre una receta (nueva o no).
  useEffect(() => {
    if (!open) return
    setServings(baseServings)
    setShowBreakdown(false)
  }, [open, baseServings, label])
  const factor = servings / baseServings

  const { data: pantryItems = [] } = usePantryItems(userId)
  const { data: savedRecipes = [] } = useSavedRecipes(userId)
  const toggleSaved = useToggleSavedRecipe(userId)
  const isSaved = useMemo(
    () => savedRecipes.some((s) => s.labelNormalized === normalizePantryName(label)),
    [savedRecipes, label],
  )
  // Feedback inmediato: mientras la mutación viaja, mostrar el estado destino.
  const showSaved = toggleSaved.isPending ? !isSaved : isSaved
  const cost = useMemo(
    () => (recipe ? computeRecipeCost(recipe.ingredients, pantryItems, baseServings) : null),
    [recipe, pantryItems, baseServings],
  )
  const hasAnyPrice = cost != null && cost.breakdown.some((b) => b.source !== 'sin_precio')

  const [media, setMedia] = useState<MealMedia | null>(null)
  useEffect(() => {
    if (!open) return
    const query = recipe?.photo_query ?? label
    setMedia(null)
    if (!query) return
    let active = true
    fetchMealMedia(query).then((m) => {
      if (active) setMedia(m)
    })
    return () => {
      active = false
    }
  }, [open, recipe?.photo_query, label])

  const haveCount = recipe?.ingredients.filter((ing) => ing.from === 'pantry').length ?? 0
  const buyCount = (recipe?.ingredients.length ?? 0) - haveCount

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {!recipe ? (
          <>
            {/* Radix exige un DialogTitle accesible; acá no hay nada que mostrar visualmente. */}
            <DialogTitle className="sr-only">{label || t('pantryPlan.recipe')}</DialogTitle>
            <div className="flex items-center justify-center py-10 px-8">
              <p className="text-sm text-muted-foreground text-center">{t('pantryPlan.error')}</p>
            </div>
          </>
        ) : (
          <div>
            {/* Kicker + título + estrella guardar */}
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t('pantryPlan.recipe')}
                  {recipe.prep_minutes != null ? `  ·  ${t('pantryPlan.prepMinutes', { min: recipe.prep_minutes })}` : ''}
                </p>
                <DialogTitle className="font-bebas text-3xl font-normal leading-tight tracking-normal text-foreground mt-1">
                  {label}
                </DialogTitle>
              </div>
              {userId != null && (
                <button
                  type="button"
                  onClick={() => toggleSaved.mutate({ label, recipe })}
                  disabled={toggleSaved.isPending}
                  className="shrink-0 p-1.5 -mt-1 text-muted-foreground hover:text-lime-400 transition-colors"
                  aria-label={showSaved ? t('savedRecipes.unsave') : t('savedRecipes.save')}
                  title={showSaved ? t('savedRecipes.unsave') : t('savedRecipes.save')}
                >
                  <Star size={20} className={showSaved ? 'text-lime-400 fill-lime-400' : ''} />
                </button>
              )}
            </div>

            {/* Foto + video/fuente (solo con match preciso en TheMealDB) */}
            {media && (
              <div className="mt-4">
                <img
                  src={media.thumb}
                  alt={label}
                  loading="lazy"
                  className="w-full aspect-video rounded-xl object-cover"
                />
                {(media.youtube || media.source) && (
                  <div className="flex items-center gap-5 mt-2">
                    {media.youtube && (
                      <a
                        href={media.youtube}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[10px] uppercase tracking-widest text-lime-400 hover:text-lime-300"
                      >
                        ▶ {t('pantryPlan.watchVideo')}
                      </a>
                    )}
                    {media.source && (
                      <a
                        href={media.source}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                      >
                        {t('pantryPlan.source')} ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Porciones — escala las cantidades */}
            <div className="flex items-center justify-between border-t border-border py-3 mt-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t('pantryPlan.servings')}
              </span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  disabled={servings <= 1}
                  className={cn(
                    'h-8 w-8 flex items-center justify-center rounded-lg border transition-colors',
                    servings <= 1 ? 'border-border' : 'border-lime-400/40 hover:bg-lime-400/10',
                  )}
                  aria-label="-"
                >
                  <span className={cn('font-bebas text-lg leading-none', servings <= 1 ? 'text-muted-foreground' : 'text-lime-400')}>
                    −
                  </span>
                </button>
                <span className="font-bebas text-2xl leading-none text-foreground min-w-[24px] text-center">{servings}</span>
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.min(MAX_SERVINGS, s + 1))}
                  disabled={servings >= MAX_SERVINGS}
                  className={cn(
                    'h-8 w-8 flex items-center justify-center rounded-lg border transition-colors',
                    servings >= MAX_SERVINGS ? 'border-border' : 'border-lime-400/40 hover:bg-lime-400/10',
                  )}
                  aria-label="+"
                >
                  <span className={cn('font-bebas text-lg leading-none', servings >= MAX_SERVINGS ? 'text-muted-foreground' : 'text-lime-400')}>
                    +
                  </span>
                </button>
              </div>
            </div>

            {/* Costo/porción — colapsable */}
            {hasAnyPrice && (
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                className="w-full text-left border-t border-border py-3"
              >
                <div className="flex items-baseline justify-between">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t('shopping.costPerServing')}
                    </span>
                    {showBreakdown ? (
                      <ChevronUp size={12} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown size={12} className="text-muted-foreground" />
                    )}
                  </div>
                  <span className="font-bebas text-2xl text-lime-400">
                    {cost!.hasEstimates ? '~' : ''}${formatMoney(cost!.perServing)}
                  </span>
                </div>
                {showBreakdown && (
                  <div>
                    {cost!.breakdown.map((b, i) => (
                      <div key={i} className="mt-1 flex justify-between">
                        <span className="text-xs text-muted-foreground">{b.name}</span>
                        <span
                          className={cn(
                            'font-mono text-xs',
                            b.source === 'sin_precio' ? 'text-muted-foreground' : b.source === 'estimada' ? 'text-amber-500' : 'text-foreground',
                          )}
                        >
                          {b.cost != null ? `${b.source === 'estimada' ? '~' : ''}$${formatMoney(b.cost)}` : t('shopping.noPrice')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            )}

            {/* Ingredientes — tally + filas con cantidad escalada */}
            {recipe.ingredients.length > 0 && (
              <>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 mt-4">
                  {t('pantryPlan.ingredients')}
                  {' · '}
                  <span className="text-lime-400">
                    {haveCount} {t('pantryPlan.haveIt')}
                  </span>
                  {buyCount > 0 && (
                    <>
                      {' · '}
                      <span className="text-amber-400">
                        {buyCount} {t('pantryPlan.toBuy')}
                      </span>
                    </>
                  )}
                </div>
                <div className="mb-5">
                  {recipe.ingredients.map((ing, i) => (
                    <div key={`${ing.name_normalized}-${i}`} className="flex items-center justify-between border-b border-border py-2.5">
                      <div className="flex-1 flex items-center gap-2 pr-2 min-w-0">
                        <span className="text-sm text-foreground truncate">{ing.name}</span>
                        {ing.qty != null && (
                          <span className="font-mono text-xs text-muted-foreground shrink-0">
                            {scaleQty(ing.qty, factor)} {ing.unit ?? ''}
                          </span>
                        )}
                      </div>
                      <div
                        className={cn(
                          'rounded border px-2 py-0.5 shrink-0',
                          ing.from === 'pantry' ? 'border-lime-400/40 bg-lime-400/10' : 'border-amber-400/40 bg-amber-400/10',
                        )}
                      >
                        <span
                          className={cn(
                            'font-mono text-[10px] uppercase tracking-wide',
                            ing.from === 'pantry' ? 'text-lime-400' : 'text-amber-400',
                          )}
                        >
                          {ing.from === 'pantry' ? `✓ ${t('pantryPlan.haveIt')}` : `🛒 ${t('pantryPlan.toBuy')}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Pasos */}
            {recipe.steps.length > 0 && (
              <>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  {t('pantryPlan.steps')}
                </div>
                <div>
                  {recipe.steps.map((step, i) => (
                    <div key={i} className="flex gap-3 py-1.5">
                      <span className="font-bebas text-base text-lime-400 w-5 shrink-0">{i + 1}</span>
                      <span className="text-sm text-foreground flex-1">{step}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
