/**
 * Extract a localized string from a PocketBase i18n JSON field.
 * Fields can be either a plain string (legacy) or {locale: "text"} object.
 * Fallback chain: requested locale → 'es' → first available → empty string.
 */
export type TranslatableField = Record<string, string> | string | null | undefined

export function localize(field: TranslatableField, locale: string = 'es'): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  return field[locale] ?? field['es'] ?? Object.values(field)[0] ?? ''
}

/**
 * Wrap a string in an i18n JSON object for saving to PocketBase.
 */
export function toTranslatable(value: string, locale: string = 'es'): Record<string, string> {
  return { [locale]: value }
}
