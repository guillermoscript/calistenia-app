import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import type { MDXComponents } from 'mdx/types'
import {
  getPostBySlug,
  getTranslation,
  loadPostContent,
  type BlogPost,
  type BlogLang,
} from '../lib/blog-content'
import { mdxComponents } from '../components/blog/mdx-components'
import { Eyebrow } from '../components/landing/shared'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import BlogCTA from '../components/blog/BlogCTA'

function formatDate(iso: string, lang: BlogLang): string {
  if (!iso) return ''
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Date(year, month - 1, day).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Carga en diferido el cuerpo MDX del post */
function useMdxContent(post: BlogPost | null) {
  const [Content, setContent] = useState<ComponentType<{ components?: MDXComponents }> | null>(null)

  useEffect(() => {
    if (!post) return
    let cancelled = false

    setContent(null)
    loadPostContent(post)
      .then((component) => {
        // `() => component` porque setState trata una función como updater
        if (!cancelled) setContent(() => component)
      })
      .catch((err) => {
        if (!cancelled) console.error('[blog] No se pudo cargar el artículo', err)
      })

    return () => {
      cancelled = true
    }
  }, [post])

  return Content
}

export default function BlogPostPage() {
  const { slug = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang: BlogLang = i18n.language?.startsWith('en') ? 'en' : 'es'

  const post = useMemo(() => getPostBySlug(slug, lang), [slug, lang])
  const translation = useMemo(() => (post ? getTranslation(post) : null), [post])
  const Content = useMdxContent(post)

  useDocumentMeta(
    post ? (post.seoTitle ?? post.title) : '',
    post ? (post.seoDescription ?? post.excerpt) : undefined
  )

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])

  if (!post) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="mb-6 text-white/55">{t('blog.notFound')}</p>
        <Link
          to="/blog"
          className="text-xs font-semibold uppercase tracking-[.16em] text-lime hover:brightness-110"
        >
          {t('blog.backToList')}
        </Link>
      </div>
    )
  }

  // El idioma de la interfaz cambió y este artículo existe traducido: llevamos
  // al lector a su URL, que es la que debe indexarse.
  if (post.lang !== lang && translation) {
    return <Navigate to={`/blog/${translation.slug}`} replace />
  }

  const date = formatDate(post.publishedAt, post.lang)
  const instagramHandle = post.author.instagram?.replace('@', '')

  return (
    <article>
      <div className="mx-auto max-w-5xl px-6 md:px-10">
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-white/40 transition hover:text-lime"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t('blog.backToList')}
        </Link>

        {/* Hero editorial */}
        <header className="mt-10 max-w-3xl">
          <Eyebrow>{t(`blog.category.${post.category}`)}</Eyebrow>
          <h1 className="mt-5 font-bebas text-5xl leading-[.88] tracking-tight sm:text-6xl md:text-7xl">
            {post.title}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/60">{post.excerpt}</p>
        </header>

        {/* Firma */}
        <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-white/10 py-4 text-[11px] uppercase tracking-[.14em] text-white/40">
          {post.author.avatar && (
            <img
              src={post.author.avatar}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
              loading="lazy"
            />
          )}
          <span className="text-white/70">{post.author.name}</span>
          {instagramHandle && (
            <a
              href={`https://instagram.com/${instagramHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-lime"
            >
              @{instagramHandle}
            </a>
          )}
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
          {translation && (
            <Link
              to={`/blog/${translation.slug}`}
              hrefLang={translation.lang}
              className="ml-auto border border-white/15 px-3 py-1.5 font-semibold transition hover:border-lime/50 hover:text-lime"
            >
              {translation.lang === 'en' ? 'Read in English' : 'Leer en Español'}
            </Link>
          )}
        </div>

        {post.cover && (
          <img
            src={post.cover}
            alt={post.coverAlt ?? ''}
            className="mt-10 w-full border border-white/10 object-cover"
          />
        )}
      </div>

      {/* Cuerpo — columna de medida de lectura (~70 caracteres) */}
      <div className="mx-auto max-w-[43rem] px-6 py-14 md:px-0">
        {Content ? (
          <div className="prose prose-invert max-w-none prose-headings:font-bebas prose-headings:tracking-tight prose-h2:mt-14 prose-h2:text-3xl prose-h2:leading-none prose-h3:text-2xl prose-p:text-[16.5px] prose-p:leading-[1.75] prose-p:text-white/65 prose-a:text-lime prose-a:no-underline hover:prose-a:underline prose-strong:font-semibold prose-strong:text-white prose-li:text-white/65 prose-li:leading-[1.7] prose-img:border prose-img:border-white/10">
            <Content components={mdxComponents} />
          </div>
        ) : (
          // Sin spinner: el MDX viene del bundle y tarda milisegundos. Un loader
          // aquí parpadearía más de lo que informa.
          <div className="min-h-[50vh]" aria-busy="true" />
        )}
      </div>

      <BlogCTA location="blog_article" />
    </article>
  )
}
