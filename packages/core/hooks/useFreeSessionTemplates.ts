import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { nowLocalForPB } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import type { Exercise, FreeSessionTemplate } from '../types'

/** Mapea un registro crudo de PocketBase al tipo FreeSessionTemplate. */
function mapRecord(r: any): FreeSessionTemplate {
  return {
    id: r.id,
    user: r.user,
    title: r.title || '',
    exercises: (Array.isArray(r.exercises) ? r.exercises : []) as Exercise[],
    usageCount: r.usage_count || 0,
    lastUsedAt: r.last_used_at || '',
  }
}

/** Firma estable de una sesión = ids de los ejercicios PRINCIPALES ordenados.
 *  Ignora warmup/cooldown (pueden variar) para deduplicar: re-hacer la misma
 *  selección no crea una plantilla nueva, solo incrementa el uso. */
function signature(exercises: Exercise[]): string {
  return exercises
    .filter(e => !e.section || e.section === 'main')
    .map(e => e.id)
    .filter(Boolean)
    .sort()
    .join('|')
}

/**
 * Plantillas reutilizables de sesión libre. Espeja useMealTemplates: una query
 * rellena el caché, las mutaciones escriben a PB e invalidan. saveTemplate
 * deduplica por firma de ejercicios (bump de uso en vez de duplicar).
 */
export function useFreeSessionTemplates(userId: string | null) {
  const qc = useQueryClient()
  const key = qk.freeSessionTemplates(userId)

  // — Lista reactiva de plantillas (más recientes primero) —
  const { data: templates = [] } = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async (): Promise<FreeSessionTemplate[]> => {
      const res = await pb.collection('free_session_templates').getList(1, 50, {
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-last_used_at',
      })
      return res.items.map(mapRecord)
    },
  })

  /**
   * Guarda la sesión como plantilla. Si ya existe una con los mismos ejercicios,
   * solo incrementa el uso. Es tolerante a fallos (p.ej. colección aún no
   * desplegada en prod): captura el error y devuelve false en vez de lanzar.
   */
  const saveTemplate = useCallback(
    async (title: string, exercises: Exercise[]): Promise<boolean> => {
      if (!userId || exercises.length === 0) return false
      try {
        const sig = signature(exercises)
        const existing = (qc.getQueryData<FreeSessionTemplate[]>(key) ?? templates)
          .find(t => signature(t.exercises) === sig)
        if (existing?.id) {
          await pb.collection('free_session_templates').update(existing.id, {
            usage_count: (existing.usageCount || 0) + 1,
            last_used_at: nowLocalForPB(),
            // refresca el título por si el usuario lo cambió en esta sesión
            ...(title ? { title } : {}),
          })
        } else {
          await pb.collection('free_session_templates').create({
            user: userId,
            title,
            exercises: JSON.stringify(exercises),
            usage_count: 0,
            last_used_at: nowLocalForPB(),
          })
        }
        await qc.invalidateQueries({ queryKey: key })
        return true
      } catch (e) {
        console.warn('PB free_session_templates save error:', e)
        return false
      }
    },
    [userId, qc, key, templates],
  )

  // — Re-lanzar: incrementa uso y devuelve los ejercicios guardados —
  const touchMutation = useMutation({
    mutationFn: async (id: string): Promise<Exercise[]> => {
      const rec: any = await pb.collection('free_session_templates').getOne(id)
      await pb.collection('free_session_templates').update(id, {
        usage_count: (rec.usage_count || 0) + 1,
        last_used_at: nowLocalForPB(),
      })
      return (Array.isArray(rec.exercises) ? rec.exercises : []) as Exercise[]
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })

  const applyTemplate = useCallback(
    (id: string): Promise<Exercise[]> => touchMutation.mutateAsync(id),
    [touchMutation],
  )

  /** Renombra una plantilla. */
  const renameTemplate = useCallback(
    async (id: string, title: string): Promise<void> => {
      await pb.collection('free_session_templates').update(id, { title })
      await qc.invalidateQueries({ queryKey: key })
    },
    [qc, key],
  )

  /** Elimina una plantilla. */
  const deleteTemplate = useCallback(
    async (id: string): Promise<void> => {
      await pb.collection('free_session_templates').delete(id)
      await qc.invalidateQueries({ queryKey: key })
    },
    [qc, key],
  )

  return { templates, saveTemplate, applyTemplate, renameTemplate, deleteTemplate }
}
