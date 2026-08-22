import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { op } from '../lib/analytics'

/**
 * Interruptor «cuenta privada» (#422).
 *
 * Público por defecto; al activarlo, seguir pasa a requerir aprobación y la
 * actividad (views `public_*`) solo la ven los seguidores aceptados. Quien ya
 * te seguía conserva el acceso: la migración dio por aceptados los follows
 * existentes y este interruptor no los toca.
 *
 * Lee de `pb.authStore.record` —que es lo que ya tienen cargado web y móvil—
 * y tras escribir hace `authRefresh()` para que el record en memoria lleve el
 * valor nuevo (sin eso el interruptor vuelve a su estado viejo al remontar).
 */
export function usePrivateAccount(userId: string | null) {
  const qc = useQueryClient()
  const read = () => pb.authStore.record?.is_private === true
  const [isPrivate, setIsPrivate] = useState<boolean>(read)
  const [saving, setSaving] = useState(false)

  // Re-sincroniza si el authStore cambia por fuera (login, authRefresh ajeno).
  useEffect(() => {
    setIsPrivate(read())
    return pb.authStore.onChange(() => setIsPrivate(read()))
  }, [userId])

  const setPrivate = useCallback(async (next: boolean): Promise<boolean> => {
    if (!userId || saving) return false
    setSaving(true)
    const prev = isPrivate
    setIsPrivate(next)
    try {
      await pb.collection('users').update(userId, { is_private: next })
      await pb.collection('users').authRefresh()
      op.track('account_privacy_changed', { is_private: next })
      // Los rankings y perfiles leen `is_private` del expand de users.
      qc.invalidateQueries({ queryKey: ['publicProfile'] })
      qc.invalidateQueries({ queryKey: ['challenge'] })
      return true
    } catch (e: any) {
      console.warn('Set private account error:', e?.status, e?.message)
      setIsPrivate(prev)
      return false
    } finally {
      setSaving(false)
    }
  }, [userId, saving, isPrivate, qc])

  return { isPrivate, saving, setPrivate }
}
