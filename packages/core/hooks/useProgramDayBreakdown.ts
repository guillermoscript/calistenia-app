/**
 * Contenido completo de un programa (todas las fases) para desglosar sus días
 * en la ficha: calentamiento, bloque principal y vuelta a la calma.
 *
 * `useProgramDetail` solo trae la semana tipo de la fase 1 —nombre y foco de
 * cada día—, que es lo que la ficha necesita para pintarse rápido. El desglose
 * necesita los ejercicios de cada fase, y eso ya lo construye
 * `fetchProgramDetail` (el mismo que usa la sesión: nombres del catálogo,
 * temporizadores deducidos de `reps`, `day_id` legacy corregidos).
 *
 * Comparte a propósito la clave `qk.programs.detail` con `usePrograms`: la
 * advertencia de `query-keys.ts` es contra formas INCOMPATIBLES, y aquí la
 * forma es la misma porque la función de consulta es la misma. Ganancia: la
 * ficha del programa activo ya tiene el desglose en caché y no pide nada.
 */

import { useQuery } from '@tanstack/react-query'
import { qk } from '../lib/query-keys'
import { fetchProgramDetail } from './usePrograms'

export function useProgramDayBreakdown(programId: string | null) {
  const query = useQuery({
    queryKey: qk.programs.detail(programId),
    enabled: !!programId,
    // Igual que `usePrograms`: con dos `staleTime` distintos sobre la misma
    // clave, el más corto forzaría refetches al del otro consumidor.
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchProgramDetail(programId!),
  })

  return {
    detail: query.data ?? null,
    loading: query.isLoading,
    error: query.error as Error | null,
  }
}
