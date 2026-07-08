/**
 * Mis recetas — recetas guardadas del plan pantry-aware (#179), versión web.
 * El costo/porción se calcula on-the-fly con computeRecipeCost (precios
 * actuales de la despensa) — nunca se persiste.
 * Puerto 1:1 de apps/mobile/src/app/saved-recipes.tsx.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { usePantryItems } from '@calistenia/core/hooks/usePantry'
import { useDeleteSavedRecipe, useSavedRecipes } from '@calistenia/core/hooks/useSavedRecipes'
import { computeRecipeCost, formatMoney } from '@calistenia/core/lib/shopping'
import type { PantryItem, SavedRecipe } from '@calistenia/core/types'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { RecipeDetailDialog } from '../components/pantry/RecipeDetailDialog'

function RecipeRow({
  item,
  pantryItems,
  onOpen,
  onDelete,
}: {
  item: SavedRecipe
  pantryItems: PantryItem[]
  onOpen: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const servings = Math.max(1, item.recipe?.servings ?? 1)
  const ingredients = useMemo(() => item.recipe?.ingredients ?? [], [item.recipe?.ingredients])
  const cost = useMemo(
    () => (ingredients.length ? computeRecipeCost(ingredients, pantryItems, servings) : null),
    [ingredients, pantryItems, servings],
  )
  const hasAnyPrice = cost != null && cost.breakdown.some((b) => b.source !== 'sin_precio')
  const meta = [
    t('savedRecipes.ingredientsCount', { count: ingredients.length }),
    item.recipe?.prep_minutes != null ? `${item.recipe.prep_minutes} min` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex items-center gap-3 border-b border-border py-3">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
        <div className="text-sm font-medium text-foreground truncate">{item.label}</div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{meta}</div>
      </button>
      {hasAnyPrice && (
        <div className="text-right shrink-0">
          <div className="font-bebas text-lg leading-none text-lime-400">
            {cost!.hasEstimates ? '~' : ''}${formatMoney(cost!.perServing)}
          </div>
          <div className="font-mono text-[9px] uppercase text-muted-foreground">{t('savedRecipes.perServing')}</div>
        </div>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="-my-2 p-2 text-muted-foreground hover:text-foreground shrink-0"
        aria-label={t('savedRecipes.delete')}
      >
        <X size={16} />
      </button>
    </div>
  )
}

export default function SavedRecipesPage({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: recipes = [], isLoading } = useSavedRecipes(userId)
  const { data: pantryItems = [] } = usePantryItems(userId)
  const del = useDeleteSavedRecipe(userId)

  const [openRecipe, setOpenRecipe] = useState<SavedRecipe | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SavedRecipe | null>(null)

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="size-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:border-lime-400/40 hover:text-foreground transition-colors"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[4px] text-muted-foreground">{t('savedRecipes.kicker')}</div>
          <div className="font-bebas text-4xl text-foreground">{t('savedRecipes.title')}</div>
        </div>
      </div>

      {recipes.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
          <div className="mb-2 font-mono text-xs uppercase tracking-[3px] text-muted-foreground">{t('savedRecipes.emptyTitle')}</div>
          <p className="text-sm text-muted-foreground">{t('savedRecipes.empty')}</p>
        </div>
      ) : (
        <div>
          {recipes.map((r) => (
            <RecipeRow
              key={r.id}
              item={r}
              pantryItems={pantryItems}
              onOpen={() => setOpenRecipe(r)}
              onDelete={() => setDeleteTarget(r)}
            />
          ))}
        </div>
      )}

      <RecipeDetailDialog
        open={openRecipe != null}
        onOpenChange={(v) => {
          if (!v) setOpenRecipe(null)
        }}
        label={openRecipe?.label ?? ''}
        recipe={openRecipe?.recipe ?? null}
        userId={userId}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
        title={t('savedRecipes.deleteTitle')}
        description={deleteTarget ? t('savedRecipes.deleteMsg', { label: deleteTarget.label }) : ''}
        confirmLabel={t('savedRecipes.delete')}
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) del.mutate(deleteTarget.id)
        }}
      />
    </div>
  )
}
