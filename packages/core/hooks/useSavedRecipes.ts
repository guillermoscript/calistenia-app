import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RecordModel } from 'pocketbase'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { normalizePantryName } from '../lib/pantry'
import type { Recipe, SavedRecipe } from '../types/pantry'

function mapSavedRecipeRecord(r: RecordModel): SavedRecipe {
  return {
    id: r.id,
    user: r.user as string,
    label: (r.label as string) ?? '',
    labelNormalized: (r.label_normalized as string) ?? '',
    // Spread sobre defaults: cubre json null Y shape parcial (p.ej. {} sin ingredients),
    // que crashearía recipe-detail (accede .ingredients/.steps sin guard).
    recipe: { steps: [], ingredients: [], prep_minutes: null, ...((r.recipe ?? {}) as Partial<Recipe>) } as Recipe,
    timesUsed: (r.times_used as number) ?? 0,
    created: r.created,
    updated: r.updated,
  }
}

/** Recetas guardadas del usuario, más reciente primero. */
export function useSavedRecipes(userId: string | null) {
  return useQuery({
    queryKey: qk.savedRecipes.list(userId),
    enabled: !!userId,
    queryFn: async () => {
      const res = await pb.collection('saved_recipes').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-created',
      })
      return res.map(mapSavedRecipeRecord)
    },
  })
}

/**
 * Toggle guardar/quitar por label_normalized (patrón useFavorites: consulta PB
 * por el estado real antes de crear/borrar — robusto ante doble tap y ante el
 * índice único (user, label_normalized)).
 */
export function useToggleSavedRecipe(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ label, recipe }: { label: string; recipe: Recipe }) => {
      if (!userId) return
      const norm = normalizePantryName(label)
      const existing = await pb.collection('saved_recipes').getFullList({
        filter: pb.filter('user = {:uid} && label_normalized = {:norm}', { uid: userId, norm }),
      })
      if (existing.length > 0) {
        for (const r of existing) await pb.collection('saved_recipes').delete(r.id)
      } else {
        await pb.collection('saved_recipes').create({
          user: userId,
          label,
          label_normalized: norm,
          recipe,
          times_used: 0,
        })
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.savedRecipes.list(userId) }),
  })
}

/** Borra una receta guardada por id. 404 = ya borrada, no es error (patrón useShoppingList). */
export function useDeleteSavedRecipe(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await pb.collection('saved_recipes').delete(id)
      } catch (e) {
        if ((e as { status?: number })?.status !== 404) throw e
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.savedRecipes.list(userId) }),
  })
}
