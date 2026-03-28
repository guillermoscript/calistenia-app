import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { marked } from 'marked'
import { Plus, Eye, EyeOff, Pencil, Trash2, Send, Save, ArrowLeft } from 'lucide-react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { localize } from '../lib/i18n-db'
import type { BlogPost } from '../hooks/useBlog'

const CATEGORIES = ['calistenia', 'tutoriales', 'nutricion', 'consejos', 'actualizaciones'] as const

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

type EditorMode = 'list' | 'edit'

interface PostForm {
  title_es: string
  title_en: string
  slug_es: string
  slug_en: string
  excerpt_es: string
  excerpt_en: string
  body_es: string
  body_en: string
  category: string
  author_name: string
  author_instagram: string
  status: string
}

const emptyForm: PostForm = {
  title_es: '', title_en: '',
  slug_es: '', slug_en: '',
  excerpt_es: '', excerpt_en: '',
  body_es: '', body_en: '',
  category: 'calistenia',
  author_name: '',
  author_instagram: '',
  status: 'draft',
}

export default function BlogEditorPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<EditorMode>('list')
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PostForm>(emptyForm)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<'es' | 'en' | null>(null)
  const [saving, setSaving] = useState(false)

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const available = await isPocketBaseAvailable()
      if (!available) return
      // Editors/admins: fetch all posts (PB rules allow viewing drafts for them)
      const result = await pb.collection('blog_posts').getList<BlogPost>(1, 50, {
        sort: '-created',
        // Override the list rule by using admin token (editors see their own drafts)
        filter: '',
      })
      setPosts(result.items)
    } catch (err) {
      console.error('Failed to load blog posts:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPosts() }, [loadPosts])

  const startNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setCoverFile(null)
    setAvatarFile(null)
    setMode('edit')
  }

  const startEdit = (post: BlogPost) => {
    setEditingId(post.id)
    setForm({
      title_es: localize(post.title, 'es'),
      title_en: localize(post.title, 'en'),
      slug_es: post.slug_es,
      slug_en: post.slug_en,
      excerpt_es: localize(post.excerpt, 'es'),
      excerpt_en: localize(post.excerpt, 'en'),
      body_es: localize(post.body, 'es'),
      body_en: localize(post.body, 'en'),
      category: post.category,
      author_name: post.author_name,
      author_instagram: post.author_instagram || '',
      status: post.status,
    })
    setCoverFile(null)
    setAvatarFile(null)
    setMode('edit')
  }

  const updateField = (field: keyof PostForm, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      // Auto-generate slugs from titles
      if (field === 'title_es' && (!prev.slug_es || prev.slug_es === slugify(prev.title_es))) {
        next.slug_es = slugify(value)
      }
      if (field === 'title_en' && (!prev.slug_en || prev.slug_en === slugify(prev.title_en))) {
        next.slug_en = slugify(value)
      }
      return next
    })
  }

  const savePost = async (publish?: boolean) => {
    setSaving(true)
    try {
      const data = new FormData()
      data.append('title', JSON.stringify({ es: form.title_es, en: form.title_en }))
      data.append('slug_es', form.slug_es)
      data.append('slug_en', form.slug_en)
      data.append('excerpt', JSON.stringify({ es: form.excerpt_es, en: form.excerpt_en }))
      data.append('body', JSON.stringify({ es: form.body_es, en: form.body_en }))
      data.append('category', form.category)
      data.append('author_name', form.author_name)
      data.append('author_instagram', form.author_instagram)

      const status = publish ? 'published' : form.status
      data.append('status', status)
      if (publish && form.status !== 'published') {
        data.append('published_at', new Date().toISOString())
      }

      if (coverFile) data.append('cover_image', coverFile)
      if (avatarFile) data.append('author_avatar', avatarFile)

      if (editingId) {
        await pb.collection('blog_posts').update(editingId, data)
      } else {
        await pb.collection('blog_posts').create(data)
      }

      await loadPosts()
      setMode('list')
    } catch (err) {
      console.error('Failed to save blog post:', err)
      alert('Error saving post. Check console for details.')
    } finally {
      setSaving(false)
    }
  }

  const deletePost = async (id: string) => {
    if (!confirm(t('common.confirm') + '?')) return
    try {
      await pb.collection('blog_posts').delete(id)
      await loadPosts()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const previewHtml = useMemo(() => {
    if (!preview) return ''
    const md = preview === 'en' ? form.body_en : form.body_es
    return marked.parse(md || '', { async: false }) as string
  }, [preview, form.body_es, form.body_en])

  // ─── List view ────────────────────────────────────
  if (mode === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{t('blog.editor.title')}</h2>
          <button
            onClick={startNew}
            className="inline-flex items-center gap-2 rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('blog.editor.newPost')}
          </button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : posts.length === 0 ? (
          <p className="text-muted-foreground">{t('blog.noPosts')}</p>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <div key={post.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{localize(post.title, 'es')}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`rounded px-1.5 py-0.5 ${post.status === 'published' ? 'bg-lime-500/15 text-lime-600' : 'bg-amber-500/15 text-amber-600'}`}>
                      {post.status}
                    </span>
                    <span>{post.category}</span>
                    {post.published_at && <span>{new Date(post.published_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <button onClick={() => startEdit(post)} className="p-2 hover:bg-muted rounded-md transition-colors">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => deletePost(post.id)} className="p-2 hover:bg-destructive/10 rounded-md transition-colors text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Edit view ────────────────────────────────────
  return (
    <div className="space-y-6">
      <button
        onClick={() => setMode('list')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </button>

      <h2 className="text-xl font-bold">
        {editingId ? t('blog.editor.editPost') : t('blog.editor.newPost')}
      </h2>

      {/* Two-column bilingual editor */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Spanish column */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Español</h3>
          <input
            type="text"
            placeholder={t('blog.editor.titlePlaceholder')}
            value={form.title_es}
            onChange={(e) => updateField('title_es', e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="slug-en-espanol"
            value={form.slug_es}
            onChange={(e) => updateField('slug_es', e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono text-muted-foreground"
          />
          <textarea
            placeholder={t('blog.editor.excerptPlaceholder')}
            value={form.excerpt_es}
            onChange={(e) => updateField('excerpt_es', e.target.value)}
            rows={2}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
          />
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Markdown</label>
              <button
                onClick={() => setPreview(preview === 'es' ? null : 'es')}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {preview === 'es' ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                Preview
              </button>
            </div>
            {preview === 'es' ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none rounded-lg border p-3 min-h-[200px]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <textarea
                placeholder={t('blog.editor.bodyPlaceholder')}
                value={form.body_es}
                onChange={(e) => updateField('body_es', e.target.value)}
                rows={12}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono resize-y"
              />
            )}
          </div>
        </div>

        {/* English column */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">English</h3>
          <input
            type="text"
            placeholder="Title in English"
            value={form.title_en}
            onChange={(e) => updateField('title_en', e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="slug-in-english"
            value={form.slug_en}
            onChange={(e) => updateField('slug_en', e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono text-muted-foreground"
          />
          <textarea
            placeholder="Short excerpt"
            value={form.excerpt_en}
            onChange={(e) => updateField('excerpt_en', e.target.value)}
            rows={2}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
          />
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Markdown</label>
              <button
                onClick={() => setPreview(preview === 'en' ? null : 'en')}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {preview === 'en' ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                Preview
              </button>
            </div>
            {preview === 'en' ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none rounded-lg border p-3 min-h-[200px]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <textarea
                placeholder="Write your article in Markdown..."
                value={form.body_en}
                onChange={(e) => updateField('body_en', e.target.value)}
                rows={12}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono resize-y"
              />
            )}
          </div>
        </div>
      </div>

      {/* Shared fields */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t('blog.editor.category')}</label>
          <select
            value={form.category}
            onChange={(e) => updateField('category', e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{t(`blog.category.${cat}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t('blog.editor.authorName')}</label>
          <input
            type="text"
            value={form.author_name}
            onChange={(e) => updateField('author_name', e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Instagram</label>
          <input
            type="text"
            placeholder="@username"
            value={form.author_instagram}
            onChange={(e) => updateField('author_instagram', e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t('blog.editor.coverImage')}</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t('blog.editor.authorAvatar')}</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
          className="w-full text-sm max-w-xs"
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 pt-4 border-t">
        <button
          onClick={() => savePost(false)}
          disabled={saving || !form.title_es || !form.slug_es || !form.slug_en}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {t('blog.editor.saveDraft')}
        </button>
        <button
          onClick={() => savePost(true)}
          disabled={saving || !form.title_es || !form.slug_es || !form.slug_en || !form.body_es}
          className="inline-flex items-center gap-2 rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 transition-colors disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          {t('blog.editor.publish')}
        </button>
      </div>
    </div>
  )
}
