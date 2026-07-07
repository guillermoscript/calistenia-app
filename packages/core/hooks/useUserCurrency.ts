/**
 * Prefs de moneda del usuario (multimoneda F5 #174, USD de referencia):
 * - default_currency: la moneda en la que el user HABLA en el chat de despensa
 *   ("compré pollo por 8" → 8 en su moneda). Blank = USD.
 * - currency_rates: última tasa usada por moneda ({"VES":143.5}) — prefill de
 *   la fila de conversión en el confirm sheet.
 * Patrón useShoppingCadence (campo en users + optimistic set).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { canonCurrency } from '../lib/money'

export interface UserCurrencyPrefs {
  defaultCurrency: string
  /** Unidades de la moneda por 1 USD, por código canónico. */
  rates: Record<string, number>
}

const FALLBACK: UserCurrencyPrefs = { defaultCurrency: 'USD', rates: {} }

export function useUserCurrency(userId: string | null) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: qk.pantry.currency(userId),
    enabled: !!userId,
    queryFn: async (): Promise<UserCurrencyPrefs> => {
      const rec = (await pb.collection('users').getOne(userId!)) as Record<string, any>
      const rates: Record<string, number> = {}
      if (rec.currency_rates && typeof rec.currency_rates === 'object') {
        for (const [k, v] of Object.entries(rec.currency_rates)) {
          const n = Number(v)
          if (n > 0) rates[k] = n
        }
      }
      return { defaultCurrency: canonCurrency(rec.default_currency) ?? 'USD', rates }
    },
  })

  const setDefaultCurrency = useMutation({
    mutationFn: async (code: string): Promise<void> => {
      await pb.collection('users').update(userId!, { default_currency: code })
    },
    onMutate: async (code) => {
      qc.setQueryData(qk.pantry.currency(userId), (prev: UserCurrencyPrefs | undefined) => ({
        ...(prev ?? FALLBACK), defaultCurrency: code,
      }))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.pantry.currency(userId) }),
  })

  const saveRate = useMutation({
    mutationFn: async ({ code, rate }: { code: string; rate: number }): Promise<void> => {
      const prev = qc.getQueryData<UserCurrencyPrefs>(qk.pantry.currency(userId))
      await pb.collection('users').update(userId!, {
        currency_rates: { ...(prev?.rates ?? {}), [code]: rate },
      })
    },
    onMutate: async ({ code, rate }) => {
      qc.setQueryData(qk.pantry.currency(userId), (prev: UserCurrencyPrefs | undefined) => ({
        ...(prev ?? FALLBACK), rates: { ...(prev?.rates ?? {}), [code]: rate },
      }))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.pantry.currency(userId) }),
  })

  return {
    prefs: query.data ?? FALLBACK,
    isLoading: query.isLoading,
    setDefaultCurrency: setDefaultCurrency.mutate,
    saveRate: saveRate.mutate,
  }
}
