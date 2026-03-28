import { useState, useEffect, useCallback } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import type { RecordModel } from 'pocketbase'

export interface BlogPost extends RecordModel {
  title: Record<string, string>
  slug_es: string
  slug_en: string
  excerpt: Record<string, string>
  body: Record<string, string>
  cover_image: string
  category: string
  author_name: string
  author_avatar: string
  author_instagram: string
  status: string
  published_at: string
  seo_title?: Record<string, string>
  seo_description?: Record<string, string>
}

export function useBlogPosts(page: number, category?: string) {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const available = await isPocketBaseAvailable()
      if (!available) { setLoading(false); return }

      const filter = category
        ? `status = "published" && category = "${category}"`
        : 'status = "published"'

      const result = await pb.collection('blog_posts').getList<BlogPost>(page, 12, {
        filter,
        sort: '-published_at',
      })

      setPosts(result.items)
      setTotalPages(result.totalPages)
      setTotalItems(result.totalItems)
    } catch (err) {
      console.error('Failed to load blog posts:', err)
    } finally {
      setLoading(false)
    }
  }, [page, category])

  useEffect(() => { load() }, [load])

  return { posts, totalPages, totalItems, loading, reload: load }
}

export function useBlogPost(slug: string, locale: string) {
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(false)
      try {
        const available = await isPocketBaseAvailable()
        if (!available) { setError(true); setLoading(false); return }

        const slugField = locale === 'en' ? 'slug_en' : 'slug_es'
        const result = await pb.collection('blog_posts').getFirstListItem<BlogPost>(
          `${slugField} = "${slug}" && status = "published"`
        )

        if (!cancelled) setPost(result)
      } catch {
        // Try the other slug field as fallback
        try {
          const fallbackField = locale === 'en' ? 'slug_es' : 'slug_en'
          const result = await pb.collection('blog_posts').getFirstListItem<BlogPost>(
            `${fallbackField} = "${slug}" && status = "published"`
          )
          if (!cancelled) setPost(result)
        } catch {
          if (!cancelled) setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [slug, locale])

  return { post, loading, error }
}

/** Get cover image URL from PocketBase file storage */
export function blogCoverUrl(post: BlogPost, thumb?: string): string {
  if (!post.cover_image) return ''
  const base = pb.files.getURL(post, post.cover_image, thumb ? { thumb } : undefined)
  return base
}

/** Get author avatar URL */
export function blogAuthorAvatarUrl(post: BlogPost): string {
  if (!post.author_avatar) return ''
  return pb.files.getURL(post, post.author_avatar, { thumb: '100x100' })
}
