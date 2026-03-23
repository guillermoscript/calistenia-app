import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { useFollows } from '../hooks/useFollows'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon'

type Tab = 'siguiendo' | 'seguidores'

interface SearchResult {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

interface FriendsPageProps {
  userId: string
}

const PAGE_SIZE = 20

// ── Pure helper — no closures over component state ───────────────────────────
// [C1 fix] Extracted as a pure function so it can't go stale inside useCallback
function mapPbItems(items: any[], excludeUserId: string): SearchResult[] {
  return items
    .filter((u: any) => u.id !== excludeUserId)
    .map((u: any) => ({
      id: u.id,
      displayName: u.display_name || u.name || u.username || '?',
      username: u.username || '',
      avatarUrl: getUserAvatarUrl(u, '100x100'),
    }))
}

// ── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="w-full px-4 py-3 bg-card border border-border rounded-lg flex items-center gap-3 animate-pulse">
      <div className="size-10 rounded-full bg-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-4 w-28 bg-muted rounded" />
      </div>
      <div className="h-8 w-20 bg-muted rounded-md shrink-0" />
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function FriendsPage({ userId }: FriendsPageProps) {
  const navigate = useNavigate()
  const { following, followers, followingIds, loading, follow, unfollow } = useFollows(userId)
  const [tab, setTab] = useState<Tab>('siguiendo')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [searchPage, setSearchPage] = useState(1)
  const [hasMoreResults, setHasMoreResults] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // [C2 fix] retryTrigger is a dependency of the search effect — incrementing it re-runs the search
  const [retryTrigger, setRetryTrigger] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const queryRef = useRef('')
  const tabsRef = useRef<HTMLDivElement>(null)

  // Derive followerIds for mutual follow detection
  const followerIds = useMemo(() => new Set(followers.map(f => f.id)), [followers])

  const profileUrl = `${window.location.origin}/u/${userId}`
  const shareMessage = `💪 Sígueme en Calistenia App y entrenemos juntos!\n${profileUrl}`

  // [L2 fix] noopener,noreferrer on window.open
  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener,noreferrer')
  }

  async function shareNative() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Calistenia App', text: 'Sígueme en Calistenia App!', url: profileUrl })
        return
      } catch { /* cancelled */ }
    }
    copyLink()
  }

  // [M1 fix] Removed deprecated document.execCommand fallback — just show feedback
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API failed (e.g. iframe sandbox, old browser) — no silent fallback
      setCopied(false)
    }
  }

  const query = search.trim()

  // Search PocketBase with fallback: if 3-field filter fails, retry with 2-field
  const searchUsers = useCallback(async (page: number, q: string) => {
    try {
      return await pb.collection('users').getList(page, PAGE_SIZE, {
        filter: pb.filter('display_name ~ {:q} || username ~ {:q} || name ~ {:q}', { q }),
        $autoCancel: false,
      })
    } catch (e: any) {
      // If filter failed (400 = bad filter), retry without name field
      if (e?.status === 400) {
        return await pb.collection('users').getList(page, PAGE_SIZE, {
          filter: pb.filter('display_name ~ {:q} || username ~ {:q}', { q }),
          $autoCancel: false,
        })
      }
      throw e
    }
  }, [])

  // Remote search — runs whenever the user types
  useEffect(() => {
    if (query.length < 1) {
      setSearchResults([])
      setSearchError(false)
      setSearching(false)
      setSearchPage(1)
      setHasMoreResults(false)
      return
    }
    queryRef.current = query
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(false)
      setSearchPage(1)
      setHasMoreResults(false)
      try {
        const res = await searchUsers(1, query)
        if (queryRef.current !== query) return // stale
        setSearchResults(mapPbItems(res.items, userId))
        setHasMoreResults(res.totalPages > 1)
        setSearchPage(1)
      } catch (e) {
        console.error('Friend search failed:', e)
        setSearchError(true)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, userId, retryTrigger, searchUsers])

  // [C1 fix] loadMore uses the pure mapPbItems with userId param — no stale closures
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMoreResults || query.length < 1) return
    const nextPage = searchPage + 1
    setLoadingMore(true)
    try {
      const res = await searchUsers(nextPage, query)
      const newItems = mapPbItems(res.items, userId)
      setSearchResults(prev => {
        const existingIds = new Set(prev.map(r => r.id))
        return [...prev, ...newItems.filter(r => !existingIds.has(r.id))]
      })
      setSearchPage(nextPage)
      setHasMoreResults(nextPage < res.totalPages)
    } catch (e) {
      console.error('Load more failed:', e)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMoreResults, searchPage, query, userId, searchUsers])

  // IntersectionObserver for infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) loadMore() },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  // [H3 fix] Memoize sorted search results instead of sorting inline every render
  const sortedSearchResults = useMemo(() =>
    searchResults.slice().sort((a, b) => {
      const aFollowed = followingIds.has(a.id) ? 0 : 1
      const bFollowed = followingIds.has(b.id) ? 0 : 1
      return aFollowed - bFollowed
    }),
  [searchResults, followingIds])

  // [H4 fix] Arrow key navigation for tabs (WAI-ARIA Tabs pattern)
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tabs = tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    if (!tabs?.length) return
    const tabIds: Tab[] = ['siguiendo', 'seguidores']
    const currentIndex = tabIds.indexOf(tab)

    let nextIndex: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabIds.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length
    } else if (e.key === 'Home') {
      nextIndex = 0
    } else if (e.key === 'End') {
      nextIndex = tabIds.length - 1
    }

    if (nextIndex !== null) {
      e.preventDefault()
      setTab(tabIds[nextIndex])
      tabs[nextIndex]?.focus()
    }
  }, [tab])

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'siguiendo', label: 'Siguiendo', count: following.length },
    { id: 'seguidores', label: 'Seguidores', count: followers.length },
  ]

  return (
    // [L4 fix] Added role="main" landmark
    <div role="main" className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[11px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Social</div>
      <h1 className="font-bebas text-4xl md:text-5xl mb-4">AMIGOS</h1>

      {/* Search input — always visible */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
        <Input
          ref={searchInputRef}
          id="tour-friends-search"
          aria-label="Buscar amigos por nombre o username"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar amigos..."
          maxLength={50}
          className="pl-9"
        />
        {search && (
          <button
            onClick={() => { setSearch(''); searchInputRef.current?.focus() }}
            // [H1 fix] 44px touch target — visual icon stays 16px but tap area is 44x44
            className="absolute right-1 top-1/2 -translate-y-1/2 size-11 flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Limpiar búsqueda"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Share invite card */}
      {!search && (
        <div className="mb-6 rounded-xl border border-border bg-card p-4 motion-safe:animate-fade-in">
          <div className="text-xs text-muted-foreground mb-3">Invita amigos a seguirte</div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={shareWhatsApp}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] tracking-widest h-9 px-4"
            >
              <WhatsAppIcon className="size-4 mr-1.5" />
              WHATSAPP
            </Button>
            <Button
              onClick={shareNative}
              variant="outline"
              size="sm"
              className="text-[11px] tracking-widest h-9 px-4"
            >
              <svg className="size-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0-12.814a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0 12.814a2.25 2.25 0 1 0 3.933 2.185 2.25 2.25 0 0 0-3.933-2.185Z" /></svg>
              COMPARTIR
            </Button>
            <Button
              onClick={copyLink}
              variant="ghost"
              size="sm"
              className="text-[11px] tracking-widest h-9 px-4"
            >
              {copied ? (
                <>
                  <svg className="size-3.5 mr-1.5 text-lime" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  COPIADO
                </>
              ) : (
                <>
                  <svg className="size-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                  COPIAR LINK
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* When searching: unified remote search results with infinite scroll */}
      {query ? (
        // [H2 fix] Removed aria-atomic="true" — only status messages use aria-live, not the full results list
        <div>
          <div aria-live="polite" className="sr-only">
            {searching && 'Buscando...'}
            {!searching && searchError && 'Error al buscar.'}
            {!searching && !searchError && searchResults.length === 0 && `No se encontraron resultados para "${search.trim()}"`}
            {!searching && searchResults.length > 0 && `${searchResults.length} resultado${searchResults.length !== 1 ? 's' : ''}`}
            {loadingMore && 'Cargando más resultados...'}
          </div>
          {searching && (
            <div className="flex flex-col gap-1.5">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}
          {!searching && searchError && (
            <div className="text-center py-8">
              <div className="text-sm text-muted-foreground mb-3">Error al buscar. Intenta de nuevo.</div>
              {/* [C2 fix] Retry by bumping retryTrigger — no string manipulation, no race condition */}
              <Button variant="outline" size="sm" onClick={() => setRetryTrigger(c => c + 1)}>Reintentar</Button>
            </div>
          )}
          {!searching && !searchError && searchResults.length === 0 && (
            <div className="text-center py-8">
              <div className="text-sm text-muted-foreground mb-3">No encontramos a &ldquo;{search.trim()}&rdquo;</div>
              <div className="text-xs text-muted-foreground mb-4">Invítalo directamente por WhatsApp</div>
              <Button
                onClick={shareWhatsApp}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] tracking-widest h-9 px-5"
              >
                <WhatsAppIcon className="size-4 mr-1.5" />
                INVITAR POR WHATSAPP
              </Button>
            </div>
          )}
          {!searching && sortedSearchResults.length > 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                {sortedSearchResults.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isFollowing={followingIds.has(user.id)}
                    isMutual={followingIds.has(user.id) && followerIds.has(user.id)}
                    onFollow={() => follow(user.id)}
                    onUnfollow={() => unfollow(user.id)}
                    onTap={() => navigate(`/u/${user.id}`)}
                  />
                ))}
              </div>
              {/* Infinite scroll sentinel */}
              {hasMoreResults && (
                <div ref={sentinelRef} className="py-4">
                  {loadingMore && (
                    <div className="flex flex-col gap-1.5">
                      <SkeletonRow />
                      <SkeletonRow />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* [H4 fix] Tabs with arrow key navigation (WAI-ARIA Tabs pattern) */}
          <div
            ref={tabsRef}
            id="tour-friends-tabs"
            role="tablist"
            aria-label="Secciones de amigos"
            className="flex gap-1.5 mb-6"
            onKeyDown={handleTabKeyDown}
          >
            {TABS.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`tabpanel-${t.id}`}
                id={`tab-${t.id}`}
                // [H4 fix] Only active tab in tab order — arrows move between tabs
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-2.5 min-h-[44px] rounded-md text-[11px] tracking-wide font-medium transition-colors duration-200 border',
                  tab === t.id
                    ? 'text-lime border-current bg-accent/50'
                    : 'text-muted-foreground border-transparent hover:text-foreground',
                )}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="ml-1 text-[11px] opacity-70">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Siguiendo */}
          {tab === 'siguiendo' && (
            <div role="tabpanel" id="tabpanel-siguiendo" aria-labelledby="tab-siguiendo">
              {loading ? (
                <div className="flex flex-col gap-1.5">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : following.length === 0 ? (
                <div className="text-center py-12 motion-safe:animate-fade-in">
                  <div className="text-muted-foreground text-sm mb-3">Aún no sigues a nadie</div>
                  <div className="text-xs text-muted-foreground mb-2">Busca amigos arriba o invítalos</div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {following.map((user, i) => (
                    <div key={user.id} className="motion-safe:animate-fade-in" style={{ animationDelay: `${Math.min(i * 50, 500)}ms`, animationFillMode: 'both' }}>
                      <UserRow
                        user={user}
                        isFollowing={true}
                        isMutual={followerIds.has(user.id)}
                        onFollow={() => follow(user.id)}
                        onUnfollow={() => unfollow(user.id)}
                        onTap={() => navigate(`/u/${user.id}`)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Seguidores */}
          {tab === 'seguidores' && (
            <div role="tabpanel" id="tabpanel-seguidores" aria-labelledby="tab-seguidores">
              {loading ? (
                <div className="flex flex-col gap-1.5">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              ) : followers.length === 0 ? (
                <div className="text-center py-12 motion-safe:animate-fade-in">
                  <div className="text-4xl mb-3 motion-safe:animate-gentle-float">👥</div>
                  <div className="text-muted-foreground text-sm mb-1">Aún no tienes seguidores</div>
                  <div className="text-xs text-muted-foreground mb-4">Comparte tu perfil para que te sigan</div>
                  <Button
                    onClick={shareWhatsApp}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] tracking-widest h-9 px-5"
                  >
                    <WhatsAppIcon className="size-4 mr-1.5" />
                    ENVIAR POR WHATSAPP
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {followers.map((user, i) => (
                    <div key={user.id} className="motion-safe:animate-fade-in" style={{ animationDelay: `${Math.min(i * 50, 500)}ms`, animationFillMode: 'both' }}>
                      <UserRow
                        user={user}
                        isFollowing={followingIds.has(user.id)}
                        isMutual={followingIds.has(user.id)}
                        onFollow={() => follow(user.id)}
                        onUnfollow={() => unfollow(user.id)}
                        onTap={() => navigate(`/u/${user.id}`)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── User Row ─────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: { id: string; displayName: string; username?: string; avatarUrl?: string | null }
  isFollowing: boolean
  isMutual?: boolean
  onFollow: () => void
  onUnfollow: () => void
  onTap: () => void
}

function UserRow({ user, isFollowing, isMutual, onFollow, onUnfollow, onTap }: UserRowProps) {
  const [actionLoading, setActionLoading] = useState(false)

  const handleAction = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    if (actionLoading) return
    setActionLoading(true)
    try {
      if (isFollowing) await onUnfollow()
      else await onFollow()
    } finally {
      setActionLoading(false)
    }
  }

  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap()
    }
  }

  return (
    <div
      className="w-full text-left px-4 py-3 bg-card border border-border rounded-lg hover:border-lime/30 transition-colors flex items-center gap-3 cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onTap}
      onKeyDown={handleRowKeyDown}
      tabIndex={0}
      role="link"
      aria-label={`Ver perfil de ${user.displayName}`}
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.displayName} loading="lazy" className="size-10 rounded-full object-cover shrink-0" />
      ) : (
        <div className="size-10 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-foreground shrink-0" aria-hidden="true">
          {user.displayName[0]?.toUpperCase() || '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{user.displayName}</div>
        <div className="flex items-center gap-1.5 min-w-0">
          {user.username && (
            <span className="text-[11px] text-muted-foreground truncate">@{user.username}</span>
          )}
          {isMutual && (
            <span className="text-[11px] text-lime shrink-0">
              · Amigos
            </span>
          )}
        </div>
      </div>
      <Button
        variant={isFollowing ? 'outline' : 'default'}
        size="sm"
        onClick={handleAction}
        disabled={actionLoading}
        className={cn(
          'text-[11px] tracking-widest h-8 shrink-0 transition-colors duration-200 active:scale-95',
          isFollowing
            ? 'hover:border-red-500 hover:text-red-500'
            : 'bg-lime text-lime-foreground hover:bg-lime/90',
        )}
      >
        {actionLoading ? '...' : isFollowing ? 'SIGUIENDO' : 'SEGUIR'}
      </Button>
    </div>
  )
}
