import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { localize, type TranslatableField } from '../lib/i18n-db'

/**
 * Hook that returns a `l()` function to extract the current-locale
 * string from a PocketBase translatable JSON field.
 *
 * Usage:
 *   const l = useLocalize()
 *   <h2>{l(exercise.name)}</h2>
 */
export function useLocalize() {
  const { i18n } = useTranslation()
  const locale = i18n.language

  return useCallback(
    (field: TranslatableField | undefined | null) => localize(field, locale),
    [locale],
  )
}
