import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { getPosts, getUsedCategories, type BlogPost, type BlogLang } from '../lib/blog-content'
import { Eyebrow, Reveal } from '../components/landing/shared'
import BlogCTA from '../components/blog/BlogCTA'

const POSTS_PER_PAGE = 12

function formatDate(iso: string, lang: BlogLang): string {
  if (!iso) return ''
  // `YYYY-MM-DD` sin hora lo parsea el navegador como UTC y en husos negativos
  // se mostraría el día anterior — se construye la fecha en local a mano.
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Date(year, month - 1, day).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Autor · fecha · lectura, en el mismo registro que los datos de la landing */
function PostMeta({ post, lang }: { post: BlogPost; lang: BlogLang }) {
  const { t } = useTranslation()
  const date = formatDate(post.publishedAt, lang)

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-[.14em] text-white/35">
      <span>{post.author.name}</span>
      {date && (
        <>
          <span aria-hidden="true">·</span>
          <time dateTime={post.publishedAt}>{date}</time>
        </>
      )}
      {post.readingMinutes ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{t('blog.readingTime', { count: post.readingMinutes })}</span>
        </>
      ) : null}
    </p>
  )
}

/** El más reciente, a lo ancho: una portada con jerarquía real, no una tarjeta más */
function FeaturedPost({ post, lang }: { post: BlogPost; lang: BlogLang }) {
  const { t } = useTranslation()

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group grid gap-8 border border-white/10 bg-[hsl(75_6%_6%)] transition hover:border-lime/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime lg:grid-cols-[1.15fr_1fr] lg:gap-0"
    >
      {post.cover && (
        <div className="overflow-hidden lg:order-2">
          <img
            src={post.cover}
            alt={post.coverAlt ?? ''}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        </div>
      )}
      <div className="flex flex-col justify-center p-6 md:p-10 lg:order-1">
        <Eyebrow>{t(`blog.category.${post.category}`)}</Eyebrow>
        <h2 className="mt-5 font-bebas text-4xl leading-[.92] tracking-tight text-white sm:text-5xl">
          {post.title}
        </h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/55">{post.excerpt}</p>
        <span className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-lime">
          {t('blog.readMore')}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
        <div className="mt-6 border-t border-white/10 pt-4">
          <PostMeta post={post} lang={lang} />
        </div>
      </div>
    </Link>
  )
}

function PostCard({ post, lang }: { post: BlogPost; lang: BlogLang }) {
  const { t } = useTranslation()

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex h-full flex-col border border-white/10 bg-[hsl(75_6%_6%)] transition hover:border-lime/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
    >
      {post.cover && (
        <div className="aspect-video overflow-hidden">
          <img
            src={post.cover}
            alt={post.coverAlt ?? ''}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <Eyebrow>{t(`blog.category.${post.category}`)}</Eyebrow>
        <h3 className="mt-4 font-bebas text-2xl leading-[.95] tracking-wide text-white">{post.title}</h3>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-white/50">{post.excerpt}</p>
        <div className="mt-6 border-t border-white/10 pt-4">
          <PostMeta post={post} lang={lang} />
        </div>
      </div>
    </Link>
  )
}

export default function BlogPage() {
  const { t, i18n } = useTranslation()
  const lang: BlogLang = i18n.language?.startsWith('en') ? 'en' : 'es'
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState<string | undefined>()

  // Los posts salen del bundle, no de la red: no hay estado de carga que mostrar.
  const posts = useMemo(() => getPosts(lang, category), [lang, category])
  const categories = useMemo(() => getUsedCategories(lang), [lang])

  const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE)
  const visiblePosts = posts.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE)

  // El destacado sólo tiene sentido en la primera página y sin filtro aplicado:
  // si el lector ha filtrado, quiere comparar resultados, no que le destaquen uno.
  const showFeatured = page === 1 && !category && visiblePosts.length > 0
  const featured = showFeatured ? visiblePosts[0] : null
  const rest = showFeatured ? visiblePosts.slice(1) : visiblePosts

  const selectCategory = (next?: string) => {
    setCategory(next)
    setPage(1)
  }

  const filterClass = (active: boolean) =>
    `border px-4 py-2 text-[11px] font-semibold uppercase tracking-[.16em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime ${
      active
        ? 'border-lime bg-lime text-[hsl(75_8%_5%)]'
        : 'border-white/15 text-white/55 hover:border-white/40 hover:text-white'
    }`

  return (
    <>
      <div className="mx-auto max-w-6xl px-6 pb-20 md:px-10 md:pb-24">
        {/* Cabecera editorial */}
        <Reveal>
          <Eyebrow>{t('blog.title')}</Eyebrow>
          <h1 className="mt-5 max-w-3xl font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl md:text-7xl">
            {t('blog.subtitle')}
          </h1>
        </Reveal>

        {/* Filtros — sólo si hay más de una categoría con artículos */}
        {categories.length > 1 && (
          <div className="mt-10 flex flex-wrap gap-2">
            <button onClick={() => selectCategory(undefined)} aria-pressed={!category} className={filterClass(!category)}>
              {t('blog.allCategories')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => selectCategory(cat)}
                aria-pressed={category === cat}
                className={filterClass(category === cat)}
              >
                {t(`blog.category.${cat}`)}
              </button>
            ))}
          </div>
        )}

        {visiblePosts.length === 0 ? (
          <p className="mt-16 border-t border-white/10 pt-16 text-white/45">{t('blog.noPosts')}</p>
        ) : (
          <>
            {featured && (
              <Reveal className="mt-12">
                <FeaturedPost post={featured} lang={lang} />
              </Reveal>
            )}

            {rest.length > 0 && (
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post, i) => (
                  <Reveal key={`${post.key}:${post.lang}`} delay={i * 70}>
                    <PostCard post={post} lang={lang} />
                  </Reveal>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-3">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="border border-white/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.16em] text-white/55 transition hover:border-white/40 hover:text-white disabled:opacity-30 disabled:hover:border-white/15"
                >
                  {t('common.back')}
                </button>
                <span className="font-mono text-xs text-white/40">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="border border-white/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.16em] text-white/55 transition hover:border-white/40 hover:text-white disabled:opacity-30 disabled:hover:border-white/15"
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <BlogCTA location="blog_listing" />
    </>
  )
}
