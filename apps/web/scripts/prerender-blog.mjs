/**
 * Pre-renderiza el blog como HTML estático para SEO.
 *
 * Se ejecuta después de `vite build`, lee los .mdx de `src/content/blog/` y
 * escribe en `dist/blog/<slug>/index.html` el artículo ya renderizado DENTRO
 * del shell de la SPA. Así:
 *   - el crawler recibe el texto completo en el primer HTML, sin ejecutar JS
 *   - el visitante real arranca la app normal (el shell conserva sus <script>)
 *
 * Antes esto leía los posts de PocketBase por HTTP. En el build de Docker no
 * hay PocketBase, así que el fetch fallaba y el catch se lo tragaba: en
 * producción nunca se generó el HTML de ningún artículo. Leyendo del disco no
 * hay red que pueda fallar.
 *
 * Uso:
 *   node scripts/prerender-blog.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement as h, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { evaluate } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import { mdxOptions } from '../mdx.options.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const CONTENT_DIR = path.join(ROOT, 'src/content/blog')
const SITE_URL = (process.env.SITE_URL || 'https://gym.guille.tech').replace(/\/$/, '')

const CATEGORY_LABELS = {
  calistenia: { es: 'Calistenia', en: 'Calisthenics' },
  tutoriales: { es: 'Tutoriales', en: 'Tutorials' },
  nutricion: { es: 'Nutrición', en: 'Nutrition' },
  consejos: { es: 'Consejos', en: 'Tips' },
  actualizaciones: { es: 'Actualizaciones', en: 'Updates' },
}

const escapeHtml = (str = '') =>
  String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const absolute = (urlPath) =>
  !urlPath ? '' : /^https?:\/\//.test(urlPath) ? urlPath : `${SITE_URL}${urlPath}`

/* ── Componentes MDX en versión Node ──────────────────────────────────────────
 * Los reales (src/components/blog/mdx-components.tsx) son TSX y usan
 * react-router, que aquí no tiene Router. Estos equivalentes emiten el mismo
 * HTML semántico para que el crawler lea exactamente el mismo texto.
 * Mantener en sync: si añades un componente al MDX, añádelo también aquí o el
 * artículo se pre-renderizará incompleto. */
const prerenderComponents = {
  a: ({ href, children }) => h('a', { href }, children),
  Callout: ({ title, children }) =>
    h('aside', { className: 'callout' }, title ? h('p', null, h('strong', null, title)) : null, children),
  Ladder: ({ children }) => h('div', { className: 'ladder' }, children),
  ProgressionStep: ({ n, title, goal, children }) =>
    h(
      'section',
      { className: 'step' },
      h('h3', null, `${n}. ${title}`),
      goal ? h('p', { className: 'goal' }, h('em', null, goal)) : null,
      children
    ),
  ExerciseLink: ({ id, children }) => h('a', { href: `/exercises/${id}` }, children),
  KeyTakeaways: ({ title, children }) =>
    h('section', { className: 'takeaways' }, h('h2', null, title ?? 'En resumen'), children),
}

/** Estilos mínimos para el instante previo a que arranque React */
const PRERENDER_STYLES = `
  .prerendered-article{max-width:44rem;margin:0 auto;padding:2rem 1rem;font-family:'DM Sans',system-ui,sans-serif;line-height:1.7}
  .prerendered-article img{max-width:100%;height:auto;border-radius:12px}
  .prerendered-article .callout,.prerendered-article .step,.prerendered-article .takeaways{border:1px solid rgba(127,127,127,.3);border-radius:12px;padding:1rem;margin:1.5rem 0}
  .prerendered-article table{width:100%;border-collapse:collapse}
  .prerendered-article th,.prerendered-article td{border:1px solid rgba(127,127,127,.3);padding:.5rem;text-align:left}
`

/* ── Lectura de contenido ─────────────────────────────────────────────────── */

/** Misma convención que `src/lib/blog-content.ts`: `<key>.<lang>.mdx` */
function parseFileName(fileName) {
  const match = fileName.match(/^(.+)\.(es|en)\.mdx$/)
  return match ? { key: match[1], lang: match[2] } : null
}

function isPublished(post) {
  if (post.draft) return false
  return post.publishedAt <= new Date().toISOString().slice(0, 10)
}

async function readPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return []

  const posts = []
  for (const fileName of fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'))) {
    const parsed = parseFileName(fileName)
    if (!parsed) {
      console.warn(`  ! nombre ignorado (esperado <key>.<es|en>.mdx): ${fileName}`)
      continue
    }

    const source = fs.readFileSync(path.join(CONTENT_DIR, fileName), 'utf-8')
    // `evaluate` compila Y ejecuta el MDX: devuelve el componente y el
    // frontmatter (`meta`) en una sola pasada.
    const mod = await evaluate(source, { ...mdxOptions, ...runtime, Fragment })
    const frontmatter = mod.meta

    if (!frontmatter?.slug || !frontmatter?.title) {
      console.warn(`  ! frontmatter incompleto (falta slug o title): ${fileName}`)
      continue
    }

    posts.push({ ...frontmatter, ...parsed, Content: mod.default })
  }

  return posts
    .filter(isPublished)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}

/* ── Inyección en el shell de la SPA ──────────────────────────────────────── */

/**
 * Mete el HTML pre-renderizado y los metadatos en `dist/index.html`,
 * conservando los <script>/<link> del bundle para que la app arranque igual.
 */
function injectIntoShell(shell, { lang, title, description, headExtra, bodyHtml }) {
  let html = shell

  html = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeHtml(description)}" />`
  )

  // Las og:/twitter: del shell son las de la landing: sobran en un artículo.
  html = html.replace(/\s*<meta (?:property|name)="(?:og|twitter):[^"]*"[^>]*>/g, '')
  html = html.replace(/\s*<!-- (?:Open Graph|Twitter)[^>]*-->/g, '')

  html = html.replace('</head>', `${headExtra}\n  </head>`)

  // El shell de Vite trae <div id="root"></div> vacío.
  const rootDiv = /<div id="root">\s*<\/div>/
  if (!rootDiv.test(html)) {
    throw new Error('No se encontró <div id="root"></div> en dist/index.html')
  }
  return html.replace(rootDiv, `<div id="root">${bodyHtml}</div>`)
}

function postHead(post, translation) {
  const seoTitle = post.seoTitle ?? post.title
  const seoDescription = post.seoDescription ?? post.excerpt
  const url = `${SITE_URL}/blog/${post.slug}`
  const cover = absolute(post.cover)

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: seoDescription,
    image: cover || undefined,
    datePublished: post.publishedAt,
    inLanguage: post.lang,
    author: { '@type': 'Person', name: post.author?.name },
    publisher: { '@type': 'Organization', name: 'Calistenia App', url: SITE_URL },
    mainEntityOfPage: url,
  })

  return `
  <link rel="canonical" href="${url}" />
  <link rel="alternate" hreflang="${post.lang}" href="${url}" />${
    translation
      ? `\n  <link rel="alternate" hreflang="${translation.lang}" href="${SITE_URL}/blog/${translation.slug}" />`
      : ''
  }
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(seoTitle)}" />
  <meta property="og:description" content="${escapeHtml(seoDescription)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:locale" content="${post.lang === 'en' ? 'en_US' : 'es_ES'}" />${
    cover ? `\n  <meta property="og:image" content="${cover}" />` : ''
  }
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(seoTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(seoDescription)}" />${
    cover ? `\n  <meta name="twitter:image" content="${cover}" />` : ''
  }
  <style>${PRERENDER_STYLES}</style>
  <script type="application/ld+json">${jsonLd}</script>`
}

function renderPostBody(post) {
  const categoryLabel = CATEGORY_LABELS[post.category]?.[post.lang] ?? post.category
  const body = renderToStaticMarkup(h(post.Content, { components: prerenderComponents }))

  return `<article class="prerendered-article">
  <nav><a href="/blog">${post.lang === 'en' ? '&larr; Back to blog' : '&larr; Volver al blog'}</a></nav>
  <p>${escapeHtml(categoryLabel)}</p>
  <h1>${escapeHtml(post.title)}</h1>
  <p>${escapeHtml(post.author?.name ?? '')} · <time datetime="${post.publishedAt}">${post.publishedAt}</time></p>
  ${post.cover ? `<img src="${post.cover}" alt="${escapeHtml(post.coverAlt ?? '')}" />` : ''}
  ${body}
</article>`
}

function renderListingBody(posts, lang) {
  const heading = lang === 'en' ? 'Blog' : 'Blog'
  const cards = posts
    .filter((post) => post.lang === lang)
    .map(
      (post) => `<li>
    <a href="/blog/${post.slug}">
      ${post.cover ? `<img src="${post.cover}" alt="${escapeHtml(post.coverAlt ?? '')}" loading="lazy" />` : ''}
      <h2>${escapeHtml(post.title)}</h2>
    </a>
    <p>${escapeHtml(post.excerpt)}</p>
    <p>${escapeHtml(post.author?.name ?? '')} · <time datetime="${post.publishedAt}">${post.publishedAt}</time></p>
  </li>`
    )
    .join('\n')

  return `<div class="prerendered-article">
  <h1>${heading}</h1>
  <ul>${cards}</ul>
</div>`
}

/* ── Sitemap / robots ─────────────────────────────────────────────────────── */

// Debe coincidir con FEATURES en src/data/features.tsx — hay un test que lo verifica.
const FEATURE_SLUGS = [
  'training', 'nutrition', 'progress', 'cardio', 'circuits', 'races', 'challenges', 'community', 'offline',
]

function generateSitemap(posts) {
  const urls = [
    `  <url><loc>${SITE_URL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>${SITE_URL}/features</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>`,
    ...FEATURE_SLUGS.map(
      (slug) => `  <url><loc>${SITE_URL}/features/${slug}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`
    ),
    `  <url><loc>${SITE_URL}/download</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    `  <url><loc>${SITE_URL}/blog</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
  ]

  for (const post of posts) {
    const translation = posts.find((p) => p.key === post.key && p.lang !== post.lang)
    urls.push(`  <url>
    <loc>${SITE_URL}/blog/${post.slug}</loc>
    <lastmod>${post.publishedAt}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
    <xhtml:link rel="alternate" hreflang="${post.lang}" href="${SITE_URL}/blog/${post.slug}" />${
      translation
        ? `\n    <xhtml:link rel="alternate" hreflang="${translation.lang}" href="${SITE_URL}/blog/${translation.slug}" />`
        : ''
    }
  </url>`)
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`
}

const generateRobotsTxt = () => `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`

/* ── Main ─────────────────────────────────────────────────────────────────── */

async function main() {
  const shellPath = path.join(DIST, 'index.html')
  if (!fs.existsSync(shellPath)) {
    throw new Error(`Falta ${shellPath} — ejecuta \`vite build\` antes que este script`)
  }
  const shell = fs.readFileSync(shellPath, 'utf-8')

  const posts = await readPosts()
  console.log(`Pre-renderizando ${posts.length} artículo(s) desde src/content/blog/`)

  for (const post of posts) {
    const translation = posts.find((p) => p.key === post.key && p.lang !== post.lang) ?? null
    const html = injectIntoShell(shell, {
      lang: post.lang,
      title: `${post.seoTitle ?? post.title} | Calistenia App`,
      description: post.seoDescription ?? post.excerpt,
      headExtra: postHead(post, translation),
      bodyHtml: renderPostBody(post),
    })

    const dir = path.join(DIST, 'blog', post.slug)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), html)
    console.log(`  /blog/${post.slug} (${post.lang})`)
  }

  // Listado: el español es el idioma principal de la audiencia
  const listingHtml = injectIntoShell(shell, {
    lang: 'es',
    title: 'Blog - Consejos y Tutoriales de Calistenia | Calistenia App',
    description: 'Consejos, tutoriales y guías para tu entrenamiento de calistenia',
    headExtra: `
  <link rel="canonical" href="${SITE_URL}/blog" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Blog - Consejos y Tutoriales de Calistenia" />
  <meta property="og:url" content="${SITE_URL}/blog" />
  <style>${PRERENDER_STYLES}</style>`,
    bodyHtml: renderListingBody(posts, 'es'),
  })
  fs.mkdirSync(path.join(DIST, 'blog'), { recursive: true })
  fs.writeFileSync(path.join(DIST, 'blog', 'index.html'), listingHtml)
  console.log('  /blog (listado)')

  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), generateSitemap(posts))
  fs.writeFileSync(path.join(DIST, 'robots.txt'), generateRobotsTxt())
  console.log('Generados sitemap.xml y robots.txt')
}

main().catch((err) => {
  // A diferencia de la versión anterior, esto SÍ rompe el build: si el
  // pre-render falla en silencio, los artículos dejan de indexarse y nadie
  // se entera hasta que el tráfico orgánico no llega.
  console.error('Fallo al pre-renderizar el blog:', err)
  process.exit(1)
})
