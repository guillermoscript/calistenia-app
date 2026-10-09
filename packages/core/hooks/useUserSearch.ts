/**
 * Búsqueda de usuarios con debounce, resultado acotado y reintento.
 *
 * La comparten la pantalla de amigos de web y la de móvil. El hook no sabe de
 * Sentry ni de i18n: el error se entrega por `onError` para que cada app lo
 * reporte a su manera.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { isAutoCancelError } from '../lib/pocketbase-errors'
import { searchUsers, type UserSearchResult } from '../lib/user-search'

export interface UseUserSearchOptions {
  /** Id del usuario actual: no sale en sus propios resultados. */
  excludeUserId?: string | null
  debounceMs?: number
  onError?: (err: unknown) => void
}

export interface UseUserSearchResult {
  results: UserSearchResult[]
  searching: boolean
  error: boolean
  /** Repite la búsqueda actual (tras un error). */
  retry: () => void
}

export function useUserSearch(term: string, opts: UseUserSearchOptions = {}): UseUserSearchResult {
  const { excludeUserId, debounceMs = 200 } = opts
  const query = term.trim()
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)
  const [retryTrigger, setRetryTrigger] = useState(0)
  const queryRef = useRef('')
  // El callback vive en una ref: cambiar de identidad no debe relanzar la búsqueda.
  const onErrorRef = useRef(opts.onError)
  onErrorRef.current = opts.onError

  useEffect(() => {
    if (query.length < 1) {
      setResults([])
      setError(false)
      setSearching(false)
      return
    }
    queryRef.current = query
    const timer = setTimeout(async () => {
      setSearching(true)
      setError(false)
      try {
        const found = await searchUsers(query, excludeUserId ?? '')
        if (queryRef.current !== query) return // obsoleta
        setResults(found)
      } catch (e) {
        if (isAutoCancelError(e)) return // cancelada por la siguiente pulsación, no es error
        onErrorRef.current?.(e)
        setError(true)
        setResults([])
      } finally {
        setSearching(false)
      }
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [query, excludeUserId, debounceMs, retryTrigger])

  const retry = useCallback(() => setRetryTrigger(n => n + 1), [])

  return { results, searching, error, retry }
}
