import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { useFollows } from '../hooks/useFollows'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

type Tab = 'siguiendo' | 'seguidores' | 'buscar'

interface SearchResult {
  id: string
  displayName: string
}

interface FriendsPageProps {
  userId: string
}

export default function FriendsPage({ userId }: FriendsPageProps) {
  const navigate = useNavigate()
  const { following, followers, followingIds, loading, follow, unfollow } = useFollows(userId)
  const [tab, setTab] = useState<Tab>('siguiendo')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Debounced search
  useEffect(() => {
    if (tab !== 'buscar' || search.length < 2) {
      setSearchResults([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const available = await isPocketBaseAvailable()
        if (!available) return
        const res = await pb.collection('users').getList(1, 20, {
          filter: pb.filter('display_name ~ {:q}', { q: search }),
          $autoCancel: false,
        })
        setSearchResults(
          res.items
            .filter((u: any) => u.id !== userId) // exclude self
            .map((u: any) => ({
              id: u.id,
              displayName: u.display_name || u.email?.split('@')[0] || '?',
            }))
        )
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search, tab, userId])

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'siguiendo', label: 'Siguiendo', count: following.length },
    { id: 'seguidores', label: 'Seguidores', count: followers.length },
    { id: 'buscar', label: 'Buscar' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Social</div>
      <h1 className="font-bebas text-4xl md:text-5xl mb-6">AMIGOS</h1>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn(
              'px-3 py-1.5 rounded-md text-[11px] tracking-wide font-medium transition-all duration-200 border',
              tab === t.id
                ? 'text-lime border-current bg-accent/50'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1 text-[10px] opacity-70">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Siguiendo */}
      {tab === 'siguiendo' && (
        <div>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>
          ) : following.length === 0 ? (
            <div className="text-center py-12 motion-safe:animate-fade-in">
              <div className="text-muted-foreground text-sm mb-3">Aun no sigues a nadie</div>
              <Button variant="outline" onClick={() => setTab('buscar')}>Buscar amigos</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {following.map((user, i) => (
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
        <div>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Cargando...</div>
          ) : followers.length === 0 ? (
            <div className="text-center py-12 motion-safe:animate-fade-in">
              <div className="text-muted-foreground text-sm">Aun no tienes seguidores</div>
              <div className="text-xs text-muted-foreground mt-1">Envia tu enlace de perfil por WhatsApp</div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {followers.map(user => (
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
        <div>
          <Input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            maxLength={50}
            className="mb-4"
          />
          {searching && (
            <div className="text-sm text-muted-foreground py-4 text-center">Buscando...</div>
          )}
          {!searching && search.length >= 2 && searchResults.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">No encontramos a "{search}". Prueba con otro nombre</div>
          )}
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
          {search.length < 2 && !searching && (
            <div className="text-sm text-muted-foreground py-8 text-center">Escribe un nombre para buscar</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── User Row ─────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: { id: string; displayName: string }
  isFollowing: boolean
  onFollow: () => void
  onUnfollow: () => void
  onTap: () => void
}

function UserRow({ user, isFollowing, onFollow, onUnfollow, onTap }: UserRowProps) {
  const [actionLoading, setActionLoading] = useState(false)

  const handleAction = async (e: React.MouseEvent) => {
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

  return (
    <div
      className="w-full text-left px-4 py-3 bg-card border border-border rounded-lg hover:border-lime/30 transition-colors flex items-center gap-3 cursor-pointer"
      onClick={onTap}
      role="link"
    >
      <div className="size-10 rounded-full bg-accent flex items-center justify-center text-sm font-medium text-foreground shrink-0">
        {user.displayName[0]?.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{user.displayName}</div>
      </div>
      <Button
        variant={isFollowing ? 'outline' : 'default'}
        size="sm"
        onClick={handleAction}
        disabled={actionLoading}
        className={cn(
          'text-[10px] tracking-widest h-8 shrink-0 transition-all duration-200 active:scale-95',
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
