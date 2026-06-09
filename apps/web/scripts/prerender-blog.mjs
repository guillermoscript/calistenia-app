/**
 * Pre-render blog posts as static HTML for SEO.
 *
 * Runs after `vite build`, fetches published posts from PocketBase,
 * and generates static HTML files in dist/blog/ with proper meta tags,
 * Open Graph, hreflang, and JSON-LD structured data.
 *
 * Usage:
 *   POCKETBASE_URL=http://127.0.0.1:8090 node scripts/prerender-blog.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { marked } from 'marked'

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090'
const DIST = path.resolve('dist')
const SITE_URL = process.env.SITE_URL || 'https://gym.guille.tech'

function localize(field, locale) {
  if (!field) return ''
  if (typeof field === 'string') return field
  return field[locale] ?? field['es'] ?? Object.values(field)[0] ?? ''
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function coverUrl(post, thumb) {
  if (!post.cover_image) return ''
  return `${PB_URL}/api/files/${post.collectionId}/${post.id}/${post.cover_image}${thumb ? `?thumb=${thumb}` : ''}`
}

async function fetchPosts() {
  const url = `${PB_URL}/api/collections/blog_posts/records?filter=status%3D%22published%22&sort=-published_at&perPage=500`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`Failed to fetch posts: ${res.status} ${res.statusText}`)
    return []
  }
  const data = await res.json()
  return data.items || []
}

function generatePostHtml(post, locale) {
  const title = localize(post.title, locale)
  const excerpt = localize(post.excerpt, locale)
  const body = localize(post.body, locale)
  const seoTitle = localize(post.seo_title, locale) || title
  const seoDescription = localize(post.seo_description, locale) || excerpt
  const slug = locale === 'en' ? post.slug_en : post.slug_es
  const altSlug = locale === 'en' ? post.slug_es : post.slug_en
  const altLocale = locale === 'en' ? 'es' : 'en'
  const cover = coverUrl(post, '800x450')
  const bodyHtml = marked.parse(body, { async: false })
  const date = post.published_at ? new Date(post.published_at).toISOString() : ''
  const dateDisplay = post.published_at
    ? new Date(post.published_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : ''

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: seoDescription,
    image: cover || undefined,
    datePublished: date,
    author: {
      '@type': 'Person',
      name: post.author_name,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Calistenia App',
      url: SITE_URL,
    },
    mainEntityOfPage: `${SITE_URL}/blog/${slug}`,
  })

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(seoTitle)} | Calistenia App Blog</title>
  <meta name="description" content="${escapeHtml(seoDescription)}" />
  <link rel="canonical" href="${SITE_URL}/blog/${slug}" />
  <link rel="alternate" hreflang="${locale}" href="${SITE_URL}/blog/${slug}" />
  <link rel="alternate" hreflang="${altLocale}" href="${SITE_URL}/blog/${altSlug}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(seoTitle)}" />
  <meta property="og:description" content="${escapeHtml(seoDescription)}" />
  ${cover ? `<meta property="og:image" content="${cover}" />` : ''}
  <meta property="og:url" content="${SITE_URL}/blog/${slug}" />
  <meta property="og:locale" content="${locale === 'en' ? 'en_US' : 'es_ES'}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(seoTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(seoDescription)}" />
  ${cover ? `<meta name="twitter:image" content="${cover}" />` : ''}
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 700px; margin: 0 auto; padding: 2rem 1rem; color: #1a1a1a; line-height: 1.7; }
    a { color: #4AA61A; }
    img { max-width: 100%; border-radius: 12px; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
    .cta { background: #f0fdf4; border: 1px solid #4AA61A40; border-radius: 16px; padding: 2rem; text-align: center; margin-top: 3rem; }
    .cta a { display: inline-block; background: #4AA61A; color: #000; padding: 0.75rem 1.5rem; border-radius: 999px; text-decoration: none; font-weight: 600; }
    nav { margin-bottom: 2rem; }
    nav a { color: #4AA61A; text-decoration: none; font-size: 0.9rem; }
  </style>
</head>
<body>
  <nav><a href="/blog">&larr; ${locale === 'en' ? 'Back to Blog' : 'Volver al Blog'}</a></nav>
  <article>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${post.author_name} &middot; ${dateDisplay}
      ${altSlug ? ` &middot; <a href="/blog/${altSlug}">${altLocale === 'en' ? 'Read in English' : 'Leer en Español'}</a>` : ''}
    </div>
    ${cover ? `<img src="${cover}" alt="${escapeHtml(title)}" />` : ''}
    ${bodyHtml}
  </article>
  <div class="cta">
    <h3>${locale === 'en' ? 'Start training with your own body' : 'Empieza a entrenar con tu propio cuerpo'}</h3>
    <p>${locale === 'en' ? 'Structured programs, progress tracking, AI nutrition, and more. Free.' : 'Programas estructurados, seguimiento de progreso, nutrición con IA y más. Gratis.'}</p>
    <a href="/auth">${locale === 'en' ? 'Create free account' : 'Crear cuenta gratis'}</a>
  </div>
</body>
</html>`
}

function generateListingHtml(posts, locale) {
  const title = locale === 'en' ? 'Blog - Calisthenics Training Tips & Tutorials' : 'Blog - Consejos y Tutoriales de Calistenia'
  const description = locale === 'en'
    ? 'Tips, tutorials, and guides for your calisthenics training'
    : 'Consejos, tutoriales y guías para tu entrenamiento de calistenia'

  const cards = posts.map((post) => {
    const postTitle = localize(post.title, locale)
    const excerpt = localize(post.excerpt, locale)
    const slug = locale === 'en' ? post.slug_en : post.slug_es
    const cover = coverUrl(post, '400x225')
    const date = post.published_at
      ? new Date(post.published_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
          year: 'numeric', month: 'short', day: 'numeric',
        })
      : ''

    return `<a href="/blog/${slug}" class="card">
      ${cover ? `<img src="${cover}" alt="${escapeHtml(postTitle)}" loading="lazy" />` : '<div class="placeholder"></div>'}
      <div class="card-body">
        <span class="badge">${post.category}</span>
        <h2>${escapeHtml(postTitle)}</h2>
        <p>${escapeHtml(excerpt)}</p>
        <small>${post.author_name} · ${date}</small>
      </div>
    </a>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | Calistenia App</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${SITE_URL}/blog" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${SITE_URL}/blog" />
  <meta property="og:type" content="website" />
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; color: #1a1a1a; }
    h1 { margin-bottom: 0.5rem; } .subtitle { color: #666; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { text-decoration: none; color: inherit; border: 1px solid #e5e5e5; border-radius: 12px; overflow: hidden; transition: box-shadow 0.2s; }
    .card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; }
    .placeholder { width: 100%; aspect-ratio: 16/9; background: #f5f5f5; }
    .card-body { padding: 1rem; }
    .badge { display: inline-block; background: #4AA61A20; color: #3d8a15; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; margin-bottom: 0.5rem; }
    .card h2 { font-size: 1.1rem; margin: 0.5rem 0; }
    .card p { color: #666; font-size: 0.9rem; margin: 0.5rem 0; }
    .card small { color: #999; font-size: 0.8rem; }
    .cta { background: #f0fdf4; border: 1px solid #4AA61A40; border-radius: 16px; padding: 2rem; text-align: center; margin-top: 3rem; }
    .cta a { display: inline-block; background: #4AA61A; color: #000; padding: 0.75rem 1.5rem; border-radius: 999px; text-decoration: none; font-weight: 600; }
    nav a { color: #4AA61A; text-decoration: none; }
  </style>
</head>
<body>
  <nav><a href="/">Calistenia App</a> · Blog</nav>
  <h1>${locale === 'en' ? 'Blog' : 'Blog'}</h1>
  <p class="subtitle">${escapeHtml(description)}</p>
  <div class="grid">${cards}</div>
  <div class="cta">
    <h3>${locale === 'en' ? 'Start training with your own body' : 'Empieza a entrenar con tu propio cuerpo'}</h3>
    <a href="/auth">${locale === 'en' ? 'Create free account' : 'Crear cuenta gratis'}</a>
  </div>
</body>
</html>`
}

function generateSitemap(posts) {
  const urls = [
    `  <url><loc>${SITE_URL}/blog</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
  ]

  for (const post of posts) {
    const date = post.published_at ? new Date(post.published_at).toISOString().split('T')[0] : ''
    for (const locale of ['es', 'en']) {
      const slug = locale === 'en' ? post.slug_en : post.slug_es
      const altSlug = locale === 'en' ? post.slug_es : post.slug_en
      const altLocale = locale === 'en' ? 'es' : 'en'
      urls.push(`  <url>
    <loc>${SITE_URL}/blog/${slug}</loc>
    ${date ? `<lastmod>${date}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
    <xhtml:link rel="alternate" hreflang="${locale}" href="${SITE_URL}/blog/${slug}" />
    <xhtml:link rel="alternate" hreflang="${altLocale}" href="${SITE_URL}/blog/${altSlug}" />
  </url>`)
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`
}

function generateRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`
}

async function main() {
  console.log(`Prerendering blog from ${PB_URL}...`)

  const posts = await fetchPosts()
  if (posts.length === 0) {
    console.log('No published posts found. Skipping prerender.')
    // Still generate sitemap and robots.txt
    fs.writeFileSync(path.join(DIST, 'sitemap.xml'), generateSitemap([]))
    fs.writeFileSync(path.join(DIST, 'robots.txt'), generateRobotsTxt())
    console.log('Generated sitemap.xml and robots.txt (empty blog)')
    return
  }

  console.log(`Found ${posts.length} published post(s)`)

  // Generate individual post pages
  for (const post of posts) {
    for (const locale of ['es', 'en']) {
      const slug = locale === 'en' ? post.slug_en : post.slug_es
      const dir = path.join(DIST, 'blog', slug)
      fs.mkdirSync(dir, { recursive: true })
      const html = generatePostHtml(post, locale)
      fs.writeFileSync(path.join(dir, 'index.html'), html)
      console.log(`  /blog/${slug} (${locale})`)
    }
  }

  // Generate listing page (Spanish as default since it's the primary audience)
  const blogDir = path.join(DIST, 'blog')
  fs.mkdirSync(blogDir, { recursive: true })
  fs.writeFileSync(path.join(blogDir, 'index.html'), generateListingHtml(posts, 'es'))
  console.log('  /blog (listing)')

  // Sitemap & robots
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), generateSitemap(posts))
  fs.writeFileSync(path.join(DIST, 'robots.txt'), generateRobotsTxt())
  console.log('Generated sitemap.xml and robots.txt')

  console.log('Blog prerender complete!')
}

main().catch((err) => {
  console.error('Blog prerender failed:', err.message)
  // Still generate robots.txt and empty sitemap so they exist
  try {
    fs.writeFileSync(path.join(DIST, 'sitemap.xml'), generateSitemap([]))
    fs.writeFileSync(path.join(DIST, 'robots.txt'), generateRobotsTxt())
    console.log('Generated fallback sitemap.xml and robots.txt')
  } catch { /* ignore */ }
  // Don't fail the build — blog prerender is optional
  process.exit(0)
})
