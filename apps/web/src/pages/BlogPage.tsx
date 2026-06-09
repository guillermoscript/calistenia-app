import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calendar, User } from 'lucide-react'
import { useBlogPosts, blogCoverUrl, type BlogPost } from '../hooks/useBlog'
import { localize } from '../lib/i18n-db'
import BlogCTA from '../components/blog/BlogCTA'
import { Loader } from '../components/ui/loader'

const CATEGORIES = ['calistenia', 'tutoriales', 'nutricion', 'consejos', 'actualizaciones'] as const

function BlogCard({ post, locale }: { post: BlogPost; locale: string }) {
  const { t } = useTranslation()
  const slug = locale === 'en' ? post.slug_en : post.slug_es
  const coverUrl = blogCoverUrl(post, '800x450')
  const date = post.published_at
    ? new Date(post.published_at).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : ''

  return (
    <Link
      to={`/blog/${slug}`}
      className="group flex flex-col rounded-xl border bg-card overflow-hidden hover:shadow-lg transition-shadow"
    >
      {coverUrl ? (
        <div className="aspect-video overflow-hidden bg-muted">
          <img
            src={coverUrl}
            alt={localize(post.title, locale)}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="aspect-video bg-muted flex items-center justify-center">
          <span className="text-4xl opacity-20">📝</span>
        </div>
      )}
      <div className="flex flex-col flex-1 p-4">
        <span className="mb-2 inline-block self-start rounded-full bg-lime-500/15 px-2.5 py-0.5 text-xs font-medium text-lime-600 dark:text-lime-400">
          {t(`blog.category.${post.category}`)}
        </span>
        <h2 className="font-bold text-lg leading-tight mb-2 group-hover:text-lime-500 transition-colors">
          {localize(post.title, locale)}
        </h2>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
          {localize(post.excerpt, locale)}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {post.author_name}
          </span>
          {date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {date}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function BlogPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language?.startsWith('en') ? 'en' : 'es'
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState<string | undefined>()

  const { posts, totalPages, loading } = useBlogPosts(page, category)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('blog.title')}</h1>
        <p className="text-muted-foreground">{t('blog.subtitle')}</p>
      </div>

      {/* Category filters */}
      <div className="mb-8 flex flex-wrap gap-2">
        <button
          onClick={() => { setCategory(undefined); setPage(1) }}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            !category
              ? 'bg-lime-500 text-black'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {t('blog.allCategories')}
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => { setCategory(cat); setPage(1) }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              category === cat
                ? 'bg-lime-500 text-black'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t(`blog.category.${cat}`)}
          </button>
        ))}
      </div>

      {/* Posts grid */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          {t('blog.noPosts')}
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <BlogCard key={post.id} post={post} locale={locale} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg px-4 py-2 text-sm border disabled:opacity-40 hover:bg-muted transition-colors"
              >
                {t('common.back')}
              </button>
              <span className="flex items-center px-3 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg px-4 py-2 text-sm border disabled:opacity-40 hover:bg-muted transition-colors"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}

      {/* CTA */}
      <div className="mt-16">
        <BlogCTA />
      </div>
    </div>
  )
}
