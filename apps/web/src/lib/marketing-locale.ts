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

export function preferredMarketingLocale(language: string | undefined): MarketingLocale {
  return language?.toLowerCase().startsWith('en') ? 'en' : 'es'
}

/** Only marketing routes get locale-prefixed URLs; app routes remain unchanged. Same list as the share links. */
export { isMarketingPath } from '@calistenia/core/lib/app-urls'

export function localizedMarketingPath(pathname: string, locale: MarketingLocale): string {
  return `/${locale}${stripMarketingLocale(pathname)}`
}
