import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Calendar, User, Instagram } from 'lucide-react'
import { marked } from 'marked'
import { useBlogPost, blogCoverUrl, blogAuthorAvatarUrl } from '../hooks/useBlog'
import { localize } from '../lib/i18n-db'
import BlogCTA from '../components/blog/BlogCTA'
import { Loader } from '../components/ui/loader'

export default function BlogPostPage() {
  const { slug = '' } = useParams()
  const { t, i18n } = useTranslation()
  const locale = i18n.language?.startsWith('en') ? 'en' : 'es'

  const { post, loading, error } = useBlogPost(slug, locale)

  const bodyHtml = useMemo(() => {
    if (!post) return ''
    const md = localize(post.body, locale)
    return marked.parse(md, { async: false }) as string
  }, [post, locale])

  if (loading) {
    return <div className="flex justify-center py-20"><Loader /></div>
  }

  if (error || !post) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-muted-foreground mb-4">{t('blog.notFound')}</p>
        <Link to="/blog" className="text-lime-500 hover:underline">
          {t('blog.backToList')}
        </Link>
      </div>
    )
  }

  const coverUrl = blogCoverUrl(post, '800x450')
  const avatarUrl = blogAuthorAvatarUrl(post)
  const date = post.published_at
    ? new Date(post.published_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : ''

  // Link to the other language version
  const altSlug = locale === 'en' ? post.slug_es : post.slug_en
  const altLang = locale === 'en' ? 'es' : 'en'

  return (
    <article className="mx-auto max-w-2xl px-4 py-8">
      {/* Back link */}
      <Link
        to="/blog"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('blog.backToList')}
      </Link>

      {/* Category badge */}
      <span className="mb-3 inline-block rounded-full bg-lime-500/15 px-2.5 py-0.5 text-xs font-medium text-lime-600 dark:text-lime-400">
        {t(`blog.category.${post.category}`)}
      </span>

      {/* Title */}
      <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
        {localize(post.title, locale)}
      </h1>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
        <div className="flex items-center gap-2">
          {avatarUrl ? (
            <img src={avatarUrl} alt={post.author_name} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <User className="h-5 w-5" />
          )}
          <span>{post.author_name}</span>
          {post.author_instagram && (
            <a
              href={`https://instagram.com/${post.author_instagram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Instagram className="h-4 w-4" />
            </a>
          )}
        </div>
        {date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {date}
          </span>
        )}
        {altSlug && (
          <Link
            to={`/blog/${altSlug}`}
            className="text-xs border rounded px-2 py-0.5 hover:bg-muted transition-colors"
          >
            {altLang === 'en' ? 'Read in English' : 'Leer en Español'}
          </Link>
        )}
      </div>

      {/* Cover image */}
      {coverUrl && (
        <div className="mb-8 rounded-xl overflow-hidden">
          <img
            src={coverUrl}
            alt={localize(post.title, locale)}
            className="w-full object-cover"
          />
        </div>
      )}

      {/* Article body */}
      <div
        className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-lime-500 prose-img:rounded-xl"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      {/* CTA */}
      <div className="mt-12">
        <BlogCTA />
      </div>
    </article>
  )
}
