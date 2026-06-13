/**
 * Usuario autenticado reactivo: re-renderiza en login/logout
 * (pb.authStore.onChange). getCurrentUser() es síncrono porque la
 * hidratación del token se hace en el boot del _layout raíz.
 */
import { useSyncExternalStore } from 'react'
import { pb, getCurrentUser } from '@calistenia/core/lib/pocketbase'
import type { RecordModel } from 'pocketbase'

function subscribe(callback: () => void): () => void {
  return pb.authStore.onChange(callback)
}

export function useAuthUser(): RecordModel | null {
  return useSyncExternalStore(subscribe, getCurrentUser, getCurrentUser)
}
