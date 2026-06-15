import { useQuery } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
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
  // Normaliza undefined a null para que qk.blogPosts sea consistente
  const cat = category ?? null

  const {
    data,
    isFetching: loading,
    refetch,
  } = useQuery({
    queryKey: qk.blogPosts(page, cat),
    staleTime: 60_000,
    queryFn: async () => {
      // Guarda de disponibilidad de PocketBase (igual que la versión imperativa)
      const available = await isPocketBaseAvailable()
      if (!available) return { items: [] as BlogPost[], totalPages: 0, totalItems: 0 }

      const filter = cat
        ? `status = "published" && category = "${cat}"`
        : 'status = "published"'

      const result = await pb.collection('blog_posts').getList<BlogPost>(page, 12, {
        filter,
        sort: '-published_at',
      })

      return {
        items: result.items,
        totalPages: result.totalPages,
        totalItems: result.totalItems,
      }
    },
  })

  return {
    posts: data?.items ?? [],
    totalPages: data?.totalPages ?? 0,
    totalItems: data?.totalItems ?? 0,
    loading,
    // reload: equivalente al `load` imperativo anterior — dispara refetch manual
    reload: refetch,
  }
}

export function useBlogPost(slug: string, locale: string) {
  const {
    data: post = null,
    isFetching: loading,
    isError: error,
  } = useQuery({
    queryKey: qk.blogPost(slug, locale),
    staleTime: 60_000,
    queryFn: async () => {
      const available = await isPocketBaseAvailable()
      if (!available) throw new Error('PocketBase no disponible')

      const slugField = locale === 'en' ? 'slug_en' : 'slug_es'
      try {
        return await pb.collection('blog_posts').getFirstListItem<BlogPost>(
          `${slugField} = "${slug}" && status = "published"`
        )
      } catch {
        // Fallback al otro campo de slug (mismo comportamiento que la versión imperativa)
        const fallbackField = locale === 'en' ? 'slug_es' : 'slug_en'
        return await pb.collection('blog_posts').getFirstListItem<BlogPost>(
          `${fallbackField} = "${slug}" && status = "published"`
        )
      }
    },
  })

  return { post, loading, error }
}

/** Obtiene la URL de la imagen de portada desde el file storage de PocketBase */
export function blogCoverUrl(post: BlogPost, thumb?: string): string {
  if (!post.cover_image) return ''
  const base = pb.files.getURL(post, post.cover_image, thumb ? { thumb } : undefined)
  return base
}

/** Obtiene la URL del avatar del autor */
export function blogAuthorAvatarUrl(post: BlogPost): string {
  if (!post.author_avatar) return ''
  return pb.files.getURL(post, post.author_avatar, { thumb: '100x100' })
}
