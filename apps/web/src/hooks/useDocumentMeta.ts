import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMarketingLocale, preferredMarketingLocale } from '../lib/marketing-locale'

const DEFAULT_TITLE = 'Calistenia App'

function ensureMeta(attribute: 'name' | 'property', value: string): HTMLMetaElement {
  const selector = `meta[${attribute}="${value}"]`
  const existing = document.querySelector<HTMLMetaElement>(selector)
  if (existing) return existing

  const tag = document.createElement('meta')
  tag.setAttribute(attribute, value)
  document.head.appendChild(tag)
  return tag
}

/**
 * Keeps the browser title and share metadata aligned with the active public
 * page. The locale comes from the URL when available, which makes previews
 * deterministic for crawlers that do not execute the SPA or read localStorage.
 */
export function useDocumentMeta(title: string, description?: string, imagePath?: string) {
  const location = useLocation()
  const { i18n } = useTranslation()

  useEffect(() => {
    const locale = getMarketingLocale(window.location.pathname) ?? preferredMarketingLocale(i18n.language)
    const origin = window.location.origin
    const image = `${origin}${imagePath ?? (locale === 'en' ? '/og-en.png' : '/og.png')}`
    const url = `${origin}${window.location.pathname}${window.location.search}`
    const fullTitle = title ? `${title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE
    const imageAlt = `${title || DEFAULT_TITLE} — Android + Web`

    const previousTitle = document.title
    const previousLang = document.documentElement.lang
    const metaUpdates: Array<[HTMLMetaElement, string]> = [
      [ensureMeta('name', 'description'), description ?? ''],
      [ensureMeta('property', 'og:title'), title || DEFAULT_TITLE],
      [ensureMeta('property', 'og:description'), description ?? ''],
      [ensureMeta('property', 'og:url'), url],
      [ensureMeta('property', 'og:locale'), locale === 'en' ? 'en_US' : 'es_ES'],
      [ensureMeta('property', 'og:image'), image],
      [ensureMeta('property', 'og:image:alt'), imageAlt],
      [ensureMeta('name', 'twitter:title'), title || DEFAULT_TITLE],
      [ensureMeta('name', 'twitter:description'), description ?? ''],
      [ensureMeta('name', 'twitter:image'), image],
    ]
    const previousMeta = metaUpdates.map(([tag]) => tag.content)

    document.title = fullTitle
    document.documentElement.lang = locale
    metaUpdates.forEach(([tag, content]) => { tag.content = content })

    return () => {
      document.title = previousTitle
      document.documentElement.lang = previousLang
      metaUpdates.forEach(([tag], index) => { tag.content = previousMeta[index] })
    }
  }, [description, i18n.language, imagePath, location.pathname, location.search, title])
}
