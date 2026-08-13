/**
 * Origen de datos del blog: ficheros MDX en `src/content/blog/`.
 *
 * Convención de nombres — `<key>.<lang>.mdx`:
 *
 *   tu-primera-dominada.es.mdx
 *   tu-primera-dominada.en.mdx
 *
 * El `key` es lo que empareja las traducciones entre sí (el enlace
 * "Leer en Español" / "Read in English" y los hreflang). El `lang` sale del
 * nombre del fichero, NO del frontmatter, para que no puedan desincronizarse.
 *
 * El `slug` sí va en el frontmatter y es independiente por idioma: así cada
 * URL puede estar escrita en su propio idioma, que es lo que quiere el SEO.
 *
 * OJO: `scripts/prerender-blog.mjs` reimplementa esta misma convención en Node
 * (no puede importar TypeScript). Si cambias el naming o los campos, cámbialo
 * también allí — hay un test que verifica que ambos coinciden.
 */
import type { ComponentType } from 'react'
import type { MDXComponents } from 'mdx/types'

export const BLOG_CATEGORIES = [
  'calistenia',
  'tutoriales',
  'nutricion',
  'consejos',
  'actualizaciones',
] as const

export type BlogCategory = (typeof BLOG_CATEGORIES)[number]

export type BlogLang = 'es' | 'en'

export interface BlogAuthor {
  name: string
  /** Ruta pública, p. ej. `/blog/authors/guillermo.webp` */
  avatar?: string
  /** Con o sin `@` — se normaliza al construir el enlace */
  instagram?: string
}

/** Lo que se escribe en el frontmatter YAML de cada `.mdx` */
export interface BlogFrontmatter {
  title: string
  excerpt: string
  slug: string
  category: BlogCategory
  author: BlogAuthor
  /** `YYYY-MM-DD`. En el futuro ⇒ el post no se lista (publicación programada) */
  publishedAt: string
  /** Ruta pública de la portada, p. ej. `/exercise-media/.../sequence.webp` */
  cover?: string
  coverAlt?: string
  /** Minutos de lectura, redondeado. Si falta, no se muestra el dato */
  readingMinutes?: number
  /** `true` ⇒ nunca se lista ni se pre-renderiza */
  draft?: boolean
  seoTitle?: string
  seoDescription?: string
}

export interface BlogPost extends BlogFrontmatter {
  /** Identificador compartido entre las traducciones del mismo artículo */
  key: string
  lang: BlogLang
}

/** Props del componente que exporta por defecto un módulo MDX */
type MDXContentProps = { components?: MDXComponents }
type MDXModule = { default: ComponentType<MDXContentProps> }

// El frontmatter se carga de forma eager: la portada necesita título, extracto
// y fecha de TODOS los posts para pintar el listado.
const frontmatterModules = import.meta.glob<BlogFrontmatter>('../content/blog/*.mdx', {
  eager: true,
  import: 'meta',
})

// El cuerpo del artículo se carga en diferido: sólo se descarga el MDX del post
// que se está leyendo, no el de todos.
const contentModules = import.meta.glob<MDXModule>('../content/blog/*.mdx')

/** `../content/blog/tu-primera-dominada.es.mdx` → `{ key, lang }` */
function parseFilePath(filePath: string): { key: string; lang: BlogLang } | null {
  const fileName = filePath.split('/').pop() ?? ''
  const match = fileName.match(/^(.+)\.(es|en)\.mdx$/)
  if (!match) return null
  return { key: match[1], lang: match[2] as BlogLang }
}

function buildPosts(): BlogPost[] {
  const posts: BlogPost[] = []

  for (const [filePath, frontmatter] of Object.entries(frontmatterModules)) {
    const parsed = parseFilePath(filePath)
    if (!parsed) {
      // Un fichero mal nombrado se ignoraría en silencio y el post
      // "desaparecería" sin más pistas — mejor gritar en desarrollo.
      if (import.meta.env.DEV) {
        console.warn(`[blog] Nombre de fichero ignorado (esperado <key>.<es|en>.mdx): ${filePath}`)
      }
      continue
    }
    if (!frontmatter?.slug || !frontmatter?.title) {
      if (import.meta.env.DEV) {
        console.warn(`[blog] Frontmatter incompleto (falta slug o title): ${filePath}`)
      }
      continue
    }
    posts.push({ ...frontmatter, key: parsed.key, lang: parsed.lang })
  }

  // Más recientes primero
  return posts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}

const ALL_POSTS = buildPosts()

/** Mapa fichero→loader indexado por `key:lang`, para cargar el cuerpo después */
const CONTENT_LOADERS = new Map<string, () => Promise<MDXModule>>(
  Object.entries(contentModules).flatMap(([filePath, loader]) => {
    const parsed = parseFilePath(filePath)
    return parsed ? [[`${parsed.key}:${parsed.lang}`, loader] as const] : []
  })
)

/** Un borrador, o un post con fecha futura, no es visible todavía */
function isPublished(post: BlogPost): boolean {
  if (post.draft) return false
  return post.publishedAt <= new Date().toISOString().slice(0, 10)
}

/** Posts publicados en un idioma, opcionalmente filtrados por categoría */
export function getPosts(lang: BlogLang, category?: string): BlogPost[] {
  return ALL_POSTS.filter(
    (post) =>
      post.lang === lang &&
      isPublished(post) &&
      (!category || post.category === category)
  )
}

/**
 * Busca por slug. Si el slug no existe en el idioma activo se prueba el otro:
 * así una URL en inglés compartida por ahí abre igual aunque la interfaz esté
 * en español, en vez de dar un 404.
 */
export function getPostBySlug(slug: string, lang: BlogLang): BlogPost | null {
  const published = ALL_POSTS.filter(isPublished)
  return (
    published.find((post) => post.slug === slug && post.lang === lang) ??
    published.find((post) => post.slug === slug) ??
    null
  )
}

/** La versión del mismo artículo en el otro idioma, si existe */
export function getTranslation(post: BlogPost): BlogPost | null {
  const otherLang: BlogLang = post.lang === 'es' ? 'en' : 'es'
  return (
    ALL_POSTS.find((p) => p.key === post.key && p.lang === otherLang && isPublished(p)) ?? null
  )
}

/** Carga en diferido el componente React con el cuerpo del artículo */
export async function loadPostContent(post: BlogPost): Promise<ComponentType<MDXContentProps>> {
  const loader = CONTENT_LOADERS.get(`${post.key}:${post.lang}`)
  if (!loader) throw new Error(`[blog] Sin contenido MDX para ${post.key}:${post.lang}`)
  const mod = await loader()
  return mod.default
}

/** Categorías que tienen al menos un post publicado en ese idioma */
export function getUsedCategories(lang: BlogLang): BlogCategory[] {
  const used = new Set(getPosts(lang).map((post) => post.category))
  return BLOG_CATEGORIES.filter((category) => used.has(category))
}
