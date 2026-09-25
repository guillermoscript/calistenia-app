export type MarketingLocale = 'es' | 'en'

const LOCALE_PREFIX = /^\/(es|en)(?=\/|$)/

/** Returns the locale explicitly encoded in a public URL, if present. */
export function getMarketingLocale(pathname: string): MarketingLocale | null {
  return (pathname.match(LOCALE_PREFIX)?.[1] as MarketingLocale | undefined) ?? null
}

/** Removes a marketing locale prefix while preserving the route used by React Router. */
export function stripMarketingLocale(pathname: string): string {
  const stripped = pathname.replace(LOCALE_PREFIX, '')
  return stripped || '/'
}

/**
 * #821: español SOLO si el idioma detectado es realmente español (cualquier
 * variante `es*`); inglés para todo lo demás, incluidas las variantes que
 * antes caían a español por descarte (portugués, alemán, hindi, indonesio…).
 */
export function preferredMarketingLocale(language: string | undefined): MarketingLocale {
  return language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/** Only marketing routes get locale-prefixed URLs; app routes remain unchanged. Same list as the share links. */
export { isMarketingPath } from '@calistenia/core/lib/app-urls'

export function localizedMarketingPath(pathname: string, locale: MarketingLocale): string {
  return `/${locale}${stripMarketingLocale(pathname)}`
}
