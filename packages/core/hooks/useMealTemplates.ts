import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { nowLocalForPB } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import type { FoodItem, MealType, MealTemplate } from '../types'

/** Mapea un registro crudo de PocketBase al tipo MealTemplate del dominio. */
function mapRecord(r: any): MealTemplate {
  return {
    id: r.id,
    user: r.user,
    name: r.name,
    foods: r.foods as FoodItem[],
    mealType: r.meal_type as MealType,
    usageCount: r.usage_count || 0,
    lastUsedAt: r.last_used_at || '',
  }
}

export function useMealTemplates(userId: string | null) {
  const qc = useQueryClient()
  const key = qk.mealTemplates(userId)

  // — Consulta reactiva de plantillas —
  // Rellena el caché automáticamente; getTemplates lee directamente de él.
  useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async (): Promise<MealTemplate[]> => {
      const res = await pb.collection('meal_templates').getList(1, 50, {
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-usage_count',
      })
      return res.items.map(mapRecord)
    },
  })

  /**
   * Devuelve las plantillas del caché si están disponibles; en caso contrario
   * fuerza un fetch y espera el resultado. Mantiene la firma pública original
   * (función async que resuelve a MealTemplate[]).
   */
  const getTemplates = useCallback(async (): Promise<MealTemplate[]> => {
    if (!userId) return []
    try {
      return await qc.fetchQuery<MealTemplate[]>({
        queryKey: key,
        queryFn: async () => {
          const res = await pb.collection('meal_templates').getList(1, 50, {
            filter: pb.filter('user = {:uid}', { uid: userId }),
            sort: '-usage_count',
          })
          return res.items.map(mapRecord)
        },
        // Si los datos tienen menos de 30 s de antigüedad no vuelve a pedir la red.
        staleTime: 30_000,
      })
    } catch {
      return []
    }
  }, [userId, qc, key])

  /** Crea una plantilla nueva en PocketBase e invalida el caché local. */
  const saveTemplate = useCallback(
    async (name: string, foods: FoodItem[], mealType: MealType): Promise<void> => {
      if (!userId) return
      await pb.collection('meal_templates').create({
        user: userId,
        name,
        foods: JSON.stringify(foods),
        meal_type: mealType,
        usage_count: 0,
        last_used_at: nowLocalForPB(),
      })
      // Invalida para que el caché se recargue con la nueva plantilla.
      await qc.invalidateQueries({ queryKey: key })
    },
    [userId, qc, key],
  )

  // — Mutación: leer plantilla + incrementar uso —
  const useTemplateMutation = useMutation({
    mutationFn: async (id: string): Promise<FoodItem[]> => {
      const rec: any = await pb.collection('meal_templates').getOne(id)
      await pb.collection('meal_templates').update(id, {
        usage_count: (rec.usage_count || 0) + 1,
        last_used_at: nowLocalForPB(),
      })
      return rec.foods as FoodItem[]
    },
    // Invalida las plantillas al terminar (éxito o error) para reflejar
    // el nuevo usage_count en el caché.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })

  /**
   * Expone useTemplate como función async para mantener la firma pública
   * original (id: string) => Promise<FoodItem[]>.
   */
  const useTemplate = useCallback(
    (id: string): Promise<FoodItem[]> => useTemplateMutation.mutateAsync(id),
    [useTemplateMutation],
  )

  /** Elimina una plantilla de PocketBase e invalida el caché. */
  const deleteTemplate = useCallback(
    async (id: string): Promise<void> => {
      await pb.collection('meal_templates').delete(id)
      await qc.invalidateQueries({ queryKey: key })
    },
    [qc, key],
  )

  return { getTemplates, saveTemplate, useTemplate, deleteTemplate }
}
