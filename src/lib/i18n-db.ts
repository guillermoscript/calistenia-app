/**
 * Helpers for reading translated PocketBase JSON fields.
 *
 * PB fields that support i18n are stored as:
 *   { "es": "Texto", "en": "Text" }
 *
 * Legacy (pre-migration) fields are plain strings.
 */

/** A PB field that may be a locale map or a legacy plain string. */
export type TranslatableField = Record<string, string> | string

/**
 * Extract the localized string from a PB JSON field.
 * Fallback chain: current locale → 'es' → first available → empty string.
 */
export function localize(
  field: TranslatableField | undefined | null,
  locale: string,
): string {
  if (!field) return ''
  if (typeof field === 'string') return field
  return field[locale] ?? field['es'] ?? Object.values(field)[0] ?? ''
}

/**
 * Wrap a user-entered string in an i18n JSON object keyed by the current locale.
 * Used when saving user-created content to PocketBase.
 */
export function toTranslatable(value: string, locale: string): Record<string, string> {
  return { [locale]: value }
}
