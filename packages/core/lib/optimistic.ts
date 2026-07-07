// packages/core/lib/optimistic.ts
// Helper para mutaciones optimistas de lista con write-through a localStorage.
// Encapsula el patrón: cancelQueries → snapshot → apply → lsWrite → return {prev, resolvedKey}.
// onError revierte usando resolvedKey (capturado en context), evitando rollback a clave errónea
// si el key del hook cambió entre onMutate y onError.

import type { QueryClient, QueryKey } from '@tanstack/react-query'

export interface OptimisticContext<T> {
  prev: T
  resolvedKey: QueryKey
}

export interface OptimisticListHandlers<T, TVariables> {
  onMutate: (variables: TVariables) => Promise<OptimisticContext<T>>
  onError: (
    err: unknown,
    variables: TVariables,
    ctx: OptimisticContext<T> | undefined
  ) => void
}

/**
 * Genera { onMutate, onError } para mutaciones optimistas sobre una lista en caché.
 *
 * @param qc         - QueryClient de TanStack Query
 * @param getKey     - Función que devuelve el QueryKey actual (se evalúa en onMutate)
 * @param getDefault - Valor por defecto si la caché y el LS están vacíos
 * @param updater    - Función pura que calcula el siguiente estado dado el actual y las variables
 * @param lsWrite    - Callback que persiste el nuevo estado en localStorage (puede ser no-op)
 */
export function makeOptimisticListHandlers<T, TVariables>(
  qc: QueryClient,
  getKey: () => QueryKey,
  getDefault: () => T,
  updater: (current: T, variables: TVariables) => T,
  lsWrite: (next: T) => void,
): OptimisticListHandlers<T, TVariables> {
  return {
    onMutate: async (variables) => {
      const resolvedKey = getKey()
      await qc.cancelQueries({ queryKey: resolvedKey })
      const prev = qc.getQueryData<T>(resolvedKey) ?? getDefault()
      const next = updater(prev, variables)
      qc.setQueryData(resolvedKey, next)
      lsWrite(next)
      return { prev, resolvedKey }
    },
    onError: (_err, _variables, ctx) => {
      // Chequear solo ctx (no ctx.prev): un prev "falsy" válido (0, '', false)
      // también debe revertirse, o la caché queda pegada al valor optimista.
      if (!ctx) return
      lsWrite(ctx.prev)
      qc.setQueryData(ctx.resolvedKey, ctx.prev)
    },
  }
}
