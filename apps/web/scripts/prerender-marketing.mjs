/**
 * Creates crawlable locale shells for the public marketing routes.
 *
 * The SPA can detect a browser language, but social crawlers generally do not
 * execute that code or read localStorage. `/en/...` and `/es/...` therefore
 * get their own first HTML response with the right Open Graph image and copy.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const SITE_URL = (process.env.SITE_URL || 'https://gym.guille.tech').replace(/\/$/, '')

const translations = Object.fromEntries(
  ['es', 'en'].map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(ROOT, '..', '..', 'packages', 'core', 'locales', locale, 'translation.json'), 'utf8')),
  ]),
)

const LOCALES = {
  es: {
    lang: 'es',
    locale: 'es_ES',
    title: 'Calistenia — Empieza desde cero. Sigue avanzando.',
    description: 'Entrenamientos guiados, nutrición con IA, despensa inteligente y progreso real. Disponible para Android y en la web.',
    image: '/og.png',
  },
  en: {
    lang: 'en',
    locale: 'en_US',
    title: 'Calistenia — Start from zero. Keep going.',
    description: 'Guided workouts, AI-powered nutrition, a smart pantry and real progress. Available for Android and the web.',
    image: '/og-en.png',
  },
}

const FEATURE_SLUGS = ['training', 'nutrition', 'progress', 'cardio', 'circuits', 'races', 'challenges', 'community', 'offline']
const ROUTES = ['', 'features', ...FEATURE_SLUGS.map((slug) => `features/${slug}`), 'download']

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function replaceMeta(html, attribute, key, content) {
  const pattern = new RegExp(`(<meta\\s+${attribute}="${key}"\\s+content=")[^"]*("\\s*/?>)`, 'i')
  return html.replace(pattern, `$1${escapeHtml(content)}$2`)
}

function pageMeta(locale, route) {
  const t = translations[locale]
  if (route === 'features') {
    return { title: t['feature.indexTitle'], description: t['feature.indexLead'] }
  }
  if (route.startsWith('features/')) {
    const slug = route.slice('features/'.length)
    return {
      title: t[`feature.${slug}.metaTitle`] ?? t[`feature.${slug}.name`],
      description: t[`feature.${slug}.metaDesc`] ?? t[`feature.${slug}.lead`],
    }
  }
  if (route === 'download') {
    return { title: t['download.metaTitle'], description: t['download.metaDesc'] }
  }
  return { title: LOCALES[locale].title, description: LOCALES[locale].description }
}

function localizedShell(shell, locale, route) {
  const config = LOCALES[locale]
  const meta = pageMeta(locale, route)
  const routePath = route ? `/${locale}/${route}` : `/${locale}/`
  const canonical = `${SITE_URL}${routePath}`
  let html = shell

  html = html.replace(/<html lang="[^"]*"/, `<html lang="${config.lang}"`)
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)} · Calistenia App</title>`)
  html = replaceMeta(html, 'name', 'description', meta.description)
  html = replaceMeta(html, 'property', 'og:title', meta.title)
  html = replaceMeta(html, 'property', 'og:description', meta.description)
  html = replaceMeta(html, 'property', 'og:url', canonical)
  html = replaceMeta(html, 'property', 'og:image', `${SITE_URL}${config.image}`)
  html = replaceMeta(html, 'property', 'og:image:alt', `${meta.title} — Android + Web`)
  html = replaceMeta(html, 'property', 'og:locale', config.locale)
  html = replaceMeta(html, 'name', 'twitter:title', meta.title)
  html = replaceMeta(html, 'name', 'twitter:description', meta.description)
  html = replaceMeta(html, 'name', 'twitter:image', `${SITE_URL}${config.image}`)
  html = html.replace('</head>', `  <link rel="canonical" href="${canonical}" />\n  </head>`)
  return html
}

function main() {
  const shellPath = path.join(DIST, 'index.html')
  if (!fs.existsSync(shellPath)) {
    throw new Error(`Falta ${shellPath} — ejecuta vite build antes que este script`)
  }

  const shell = fs.readFileSync(shellPath, 'utf8')
  for (const [locale, routes] of Object.entries({ es: ROUTES, en: ROUTES })) {
    for (const route of routes) {
      const directory = path.join(DIST, locale, ...route.split('/').filter(Boolean))
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(path.join(directory, 'index.html'), localizedShell(shell, locale, route))
    }
    console.log(`Generados ${routes.length} shell(s) de marketing /${locale}/`)
  }
}

main()
