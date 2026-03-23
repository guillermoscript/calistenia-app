import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { useFollows } from '../hooks/useFollows'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon'

type Tab = 'siguiendo' | 'seguidores' | 'buscar'

interface SearchResult {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

interface FriendsPageProps {
  userId: string
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const profileUrl = `${window.location.origin}/u/${userId}`
  const shareMessage = `💪 Sígueme en Calistenia App y entrenemos juntos!\n${profileUrl}`

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, '_blank')
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

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text in a temporary input instead of prompt()
      const input = document.createElement('input')
      input.value = profileUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Filter following/followers locally based on search query
  const query = search.trim().toLowerCase()

  const filteredFollowing = useMemo(() => {
    if (!query) return following
    return following.filter(
      u =>
        u.displayName.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query),
    )
  }, [following, query])

  const filteredFollowers = useMemo(() => {
    if (!query) return followers
    return followers.filter(
      u =>
        u.displayName.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query),
    )
  }, [followers, query])

  // Remote search for the Buscar tab
  useEffect(() => {
    if (tab !== 'buscar' || query.length < 1) {
      setSearchResults([])
      setSearchError(false)
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(false)
      try {
        const available = await isPocketBaseAvailable()
        if (!available) {
          setSearchError(true)
          return
        }
        const res = await pb.collection('users').getList(1, 20, {
          filter: pb.filter('display_name ~ {:q} || username ~ {:q}', { q: query }),
          $autoCancel: false,
        })
        setSearchResults(
          res.items
            .filter((u: any) => u.id !== userId)
            .map((u: any) => ({
              id: u.id,
              displayName: u.display_name || u.username || '?',
              username: u.username || '',
              avatarUrl: getUserAvatarUrl(u, '100x100'),
            }))
        )
      } catch (e) {
        console.warn('Friend search failed:', e)
        setSearchError(true)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => clearTimeout(debounceRef.current)
  }, [query, tab, userId])

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'siguiendo', label: 'Siguiendo', count: following.length },
    { id: 'seguidores', label: 'Seguidores', count: followers.length },
    { id: 'buscar', label: 'Buscar' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Social</div>
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] tracking-widest h-9 px-4"
            >
              <WhatsAppIcon className="size-4 mr-1.5" />
              WHATSAPP
            </Button>
            <Button
              onClick={shareNative}
              variant="outline"
              size="sm"
              className="text-[10px] tracking-widest h-9 px-4"
            >
              <svg className="size-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0-12.814a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0 12.814a2.25 2.25 0 1 0 3.933 2.185 2.25 2.25 0 0 0-3.933-2.185Z" /></svg>
              COMPARTIR
            </Button>
            <Button
              onClick={copyLink}
              variant="ghost"
              size="sm"
              className="text-[10px] tracking-widest h-9 px-4"
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

      {/* Tabs — proper ARIA tablist */}
      <div id="tour-friends-tabs" role="tablist" aria-label="Secciones de amigos" className="flex gap-1.5 mb-6">
        {TABS.map(t => {
          // Show filtered count when searching on siguiendo/seguidores
          let displayCount = t.count
          if (query && t.id === 'siguiendo') displayCount = filteredFollowing.length
          if (query && t.id === 'seguidores') displayCount = filteredFollowers.length

          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`tabpanel-${t.id}`}
              id={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-2.5 min-h-[44px] rounded-md text-[11px] tracking-wide font-medium transition-colors duration-200 border',
                tab === t.id
                  ? 'text-lime border-current bg-accent/50'
                  : 'text-muted-foreground border-transparent hover:text-foreground',
              )}
            >
              {t.label}
              {displayCount != null && displayCount > 0 && (
                <span className="ml-1 text-[10px] opacity-70">{displayCount}</span>
              )}
            </button>
          )
        })}
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
          ) : filteredFollowing.length === 0 ? (
            <div className="text-center py-12 motion-safe:animate-fade-in">
              <div className="text-muted-foreground text-sm mb-3">
                {query ? `No encontraste "${search}" en tus seguidos` : 'Aún no sigues a nadie'}
              </div>
              {query ? (
                <Button variant="outline" onClick={() => { setTab('buscar') }}>Buscar en todos los usuarios</Button>
              ) : (
                <Button variant="outline" onClick={() => setTab('buscar')}>Buscar amigos</Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredFollowing.map((user, i) => (
                <div key={user.id} className="motion-safe:animate-fade-in" style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}>
                  <UserRow
                    user={user}
                    isFollowing={true}
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
          ) : filteredFollowers.length === 0 ? (
            <div className="text-center py-12 motion-safe:animate-fade-in">
              {query ? (
                <>
                  <div className="text-muted-foreground text-sm mb-3">No encontraste &ldquo;{search}&rdquo; en tus seguidores</div>
                  <Button variant="outline" onClick={() => setTab('buscar')}>Buscar en todos los usuarios</Button>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-3 motion-safe:animate-gentle-float">👥</div>
                  <div className="text-muted-foreground text-sm mb-1">Aún no tienes seguidores</div>
                  <div className="text-xs text-muted-foreground mb-4">Comparte tu perfil para que te sigan</div>
                  <Button
                    onClick={shareWhatsApp}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] tracking-widest h-9 px-5"
                  >
                    <WhatsAppIcon className="size-4 mr-1.5" />
                    ENVIAR POR WHATSAPP
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredFollowers.map(user => (
                <UserRow
                  key={user.id}
                  user={user}
                  isFollowing={followingIds.has(user.id)}
                  onFollow={() => follow(user.id)}
                  onUnfollow={() => unfollow(user.id)}
                  onTap={() => navigate(`/u/${user.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Buscar */}
      {tab === 'buscar' && (
        <div role="tabpanel" id="tabpanel-buscar" aria-labelledby="tab-buscar">
          <div aria-live="polite" aria-atomic="true">
            {searching && (
              <div className="text-sm text-muted-foreground py-4 text-center">Buscando...</div>
            )}
            {!searching && searchError && query.length >= 1 && (
              <div className="text-center py-8">
                <div className="text-sm text-muted-foreground mb-3">Error al buscar. Intenta de nuevo.</div>
                <Button variant="outline" size="sm" onClick={() => setSearch(search + ' ')}>Reintentar</Button>
              </div>
            )}
            {!searching && !searchError && query.length >= 1 && searchResults.length === 0 && (
              <div className="text-center py-8">
                <div className="text-sm text-muted-foreground mb-3">No encontramos a &ldquo;{search}&rdquo;</div>
                <div className="text-xs text-muted-foreground mb-4">Invítalo directamente por WhatsApp</div>
                <Button
                  onClick={shareWhatsApp}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] tracking-widest h-9 px-5"
                >
                  <WhatsAppIcon className="size-4 mr-1.5" />
                  INVITAR POR WHATSAPP
                </Button>
              </div>
            )}
            {!searching && query.length >= 1 && searchResults.length > 0 && (
              <div className="sr-only">{searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} encontrado{searchResults.length !== 1 ? 's' : ''}</div>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {searchResults.map(user => (
                <UserRow
                  key={user.id}
                  user={user}
                  isFollowing={followingIds.has(user.id)}
                  onFollow={() => follow(user.id)}
                  onUnfollow={() => unfollow(user.id)}
                  onTap={() => navigate(`/u/${user.id}`)}
                />
              ))}
            </div>
          )}
          {query.length < 1 && !searching && (
            <div className="text-sm text-muted-foreground py-8 text-center">Escribe un nombre o username para buscar</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── User Row ─────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: { id: string; displayName: string; username?: string; avatarUrl?: string | null }
  isFollowing: boolean
  onFollow: () => void
  onUnfollow: () => void
  onTap: () => void
}

function UserRow({ user, isFollowing, onFollow, onUnfollow, onTap }: UserRowProps) {
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
      className="w-full text-left px-4 py-3 bg-card border border-border rounded-lg hover:border-lime/30 transition-colors flex items-center gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onTap}
      onKeyDown={handleRowKeyDown}
      tabIndex={0}
      role="link"
      aria-label={`Ver perfil de ${user.displayName}`}
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.displayName} className="size-10 rounded-full object-cover shrink-0" />
      ) : (
        <div className="size-10 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-foreground shrink-0" aria-hidden="true">
          {user.displayName[0]?.toUpperCase() || '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{user.displayName}</div>
        {user.username && (
          <div className="text-[11px] text-muted-foreground truncate">@{user.username}</div>
        )}
      </div>
      <Button
        variant={isFollowing ? 'outline' : 'default'}
        size="sm"
        onClick={handleAction}
        disabled={actionLoading}
        className={cn(
          'text-[10px] tracking-widest h-8 shrink-0 transition-colors duration-200 active:scale-95',
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
