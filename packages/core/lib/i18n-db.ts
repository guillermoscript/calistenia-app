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

/** Sufijo de copia por locale. Cae a español para locales sin traducción. */
const COPY_SUFFIX: Record<string, string> = { es: '(copia)', en: '(copy)' }

/**
 * Nombre de una copia, conservando el mapa i18n del original (issue #602).
 *
 * Interpolar el campo directamente (`${field} (copia)`) daba
 * «[object Object] (copia)», y además escribía un string plano en una columna
 * `json`, así que `localize()` tampoco lo recuperaba después. Aquí cada locale
 * presente en el original recibe su propio sufijo.
 *
 * Un string plano (fila anterior a la migración i18n) no dice en qué idioma
 * está, así que la copia se guarda solo bajo `locale`, igual que `toTranslatable`.
 */
export function duplicatedName(
  field: TranslatableField | undefined | null,
  locale: string,
): Record<string, string> {
  const suffixed = (text: string, loc: string) =>
    `${text} ${COPY_SUFFIX[loc] ?? COPY_SUFFIX.es}`.trim()
  const entries = field && typeof field === 'object' ? Object.entries(field) : []
  if (entries.length === 0) return toTranslatable(suffixed(localize(field, locale), locale), locale)
  return Object.fromEntries(entries.map(([loc, text]) => [loc, suffixed(String(text), loc)]))
}
