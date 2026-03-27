import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { pb } from '../lib/pocketbase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { ConfirmDialog } from '../components/ui/confirm-dialog'
import { cn } from '../lib/utils'
import { PB_ADMIN_URL, pbCollectionUrl } from '../lib/pocketbase-admin'
import { useWorkoutState } from '../contexts/WorkoutContext'
import type { UserRole } from '../types'

type Tab = 'overview' | 'users' | 'programs'

interface UserRecord {
  id: string
  email: string
  display_name: string
  role: UserRole
  tier: string
  created: string
  total_sessions?: number
}

interface AdminStats {
  totalUsers: number
  activeThisWeek: number
  totalSessions: number
  officialPrograms: number
}

export default function AdminPage() {
  const { t } = useTranslation()
  const { programs } = useWorkoutState()
  const [tab, setTab] = useState<Tab>('overview')
  const [users, setUsers] = useState<UserRecord[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, activeThisWeek: 0, totalSessions: 0, officialPrograms: 0 })
  const [loading, setLoading] = useState(false)
  const [roleConfirm, setRoleConfirm] = useState<{ userId: string; newRole: UserRole } | null>(null)
  const [unpublishConfirm, setUnpublishConfirm] = useState<string | null>(null)

  // Load stats
  useEffect(() => {
    const loadStats = async () => {
      try {
        const usersRes = await pb.collection('users').getList(1, 1)
        const officialCount = programs.filter(p => p.is_official).length
        setStats({
          totalUsers: usersRes.totalItems,
          activeThisWeek: 0, // Would need sessions query
          totalSessions: 0,
          officialPrograms: officialCount,
        })
      } catch (e) {
        console.error('AdminPage: stats error', e)
      }
    }
    loadStats()
  }, [programs])

  // Search users
  const searchUsers = useCallback(async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    try {
      const q = searchQuery.trim()
      const res = await pb.collection('users').getList(1, 50, {
        filter: `email ~ "${q}" || display_name ~ "${q}"`,
        sort: '-created',
      })
      setUsers(res.items.map(u => ({
        id: u.id,
        email: u.email,
        display_name: u.display_name || '',
        role: (u.role as UserRole) || 'user',
        tier: u.tier || 'free',
        created: u.created,
      })))
    } catch (e) {
      console.error('AdminPage: search error', e)
    } finally {
      setLoading(false)
    }
  }, [searchQuery])

  // Change user role
  const changeRole = async (userId: string, newRole: UserRole) => {
    try {
      await pb.collection('users').update(userId, { role: newRole })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } catch (e) {
      console.error('AdminPage: changeRole error', e)
    }
  }

  // Toggle featured on program
  const toggleFeatured = async (programId: string, current: boolean) => {
    try {
      await pb.collection('programs').update(programId, { is_featured: !current })
    } catch (e) {
      console.error('AdminPage: toggleFeatured error', e)
    }
  }

  // Unpublish program
  const unpublishProgram = async (programId: string) => {
    try {
      await pb.collection('programs').update(programId, { is_official: false, is_featured: false })
    } catch (e) {
      console.error('AdminPage: unpublish error', e)
    }
  }

  const officialPrograms = programs.filter(p => p.is_official)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('admin.overview') },
    { id: 'users', label: t('admin.users') },
    { id: 'programs', label: t('admin.programs') },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('admin.section')}</div>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <h1 className="font-bebas text-5xl">{t('admin.title')}</h1>
        <a
          href={PB_ADMIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:border-[hsl(var(--lime))]/40 hover:text-[hsl(var(--lime))] transition-colors"
        >
          <span className="text-base">⚙</span> PocketBase Admin
          <span className="text-[10px] opacity-60">↗</span>
        </a>
      </div>

      {/* Quick links to PB collections */}
      <div className="flex gap-2 flex-wrap mb-6">
        {([
          { label: t('admin.exercisesProgram'), collection: 'program_exercises' as const },
          { label: t('admin.exercisesCatalog'), collection: 'exercises_catalog' as const },
          { label: t('admin.programs'), collection: 'programs' as const },
          { label: t('admin.users'), collection: 'users' as const },
        ]).map(link => (
          <a
            key={link.collection}
            href={pbCollectionUrl(link.collection)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg border border-border text-[11px] font-mono tracking-wide text-muted-foreground hover:border-sky-500/40 hover:text-sky-400 transition-colors"
          >
            {link.label} ↗
          </a>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {TABS.map(tb => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              'px-5 py-2.5 rounded-full text-[12px] font-mono tracking-widest transition-all border uppercase',
              tab === tb.id
                ? 'bg-[hsl(var(--lime))]/10 border-[hsl(var(--lime))]/30 text-[hsl(var(--lime))]'
                : 'bg-transparent border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="font-bebas text-4xl text-[hsl(var(--lime))]">{stats.totalUsers}</div>
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('admin.totalUsers')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="font-bebas text-4xl text-sky-500">{officialPrograms.length}</div>
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('admin.officialPrograms')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="font-bebas text-4xl text-amber-400">{programs.filter(p => p.is_featured).length}</div>
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('admin.featured')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="font-bebas text-4xl text-pink-500">{programs.length}</div>
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('admin.totalPrograms')}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div>
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchUsers()}
              placeholder={t('admin.searchPlaceholder')}
              className="flex-1 h-11 px-4 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[hsl(var(--lime))]/30 text-sm"
            />
            <Button onClick={searchUsers} disabled={loading} className="h-11 px-6 font-mono text-xs tracking-widest bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background">
              {loading ? t('admin.searching') : t('admin.searchBtn')}
            </Button>
          </div>

          {users.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {t('admin.searchHint')}
            </div>
          ) : (
            <div className="space-y-3">
              {users.map(u => (
                <Card key={u.id}>
                  <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                    <div className="size-9 rounded-full bg-accent flex items-center justify-center text-sm font-medium shrink-0">
                      {u.display_name?.[0]?.toUpperCase() || u.email[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.display_name || u.email}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] px-2 tracking-widest',
                        u.role === 'admin' && 'text-red-400 border-red-400/30',
                        u.role === 'editor' && 'text-amber-400 border-amber-400/30',
                        u.role === 'user' && 'text-muted-foreground border-border',
                      )}
                    >
                      {u.role.toUpperCase()}
                    </Badge>
                    <div className="flex gap-2">
                      {u.role !== 'editor' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRoleConfirm({ userId: u.id, newRole: 'editor' })}
                          className="text-[10px] tracking-widest hover:border-amber-400 hover:text-amber-400"
                        >
                          {t('admin.makeEditor')}
                        </Button>
                      )}
                      {u.role === 'editor' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRoleConfirm({ userId: u.id, newRole: 'user' })}
                          className="text-[10px] tracking-widest hover:border-muted-foreground"
                        >
                          {t('admin.removeEditor')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Programs */}
      {tab === 'programs' && (
        <div className="space-y-3">
          {officialPrograms.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {t('admin.noOfficialPrograms')}
            </div>
          ) : (
            officialPrograms.map(p => (
              <Card key={p.id}>
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      {p.is_featured && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-400 border-amber-400/30">
                          {t('admin.featured')}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground border-border">
                        {(p.difficulty || 'beginner').toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.duration_weeks} {t('admin.weeks')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleFeatured(p.id, !!p.is_featured)}
                      className={cn(
                        'text-[10px] tracking-widest',
                        p.is_featured
                          ? 'text-amber-400 border-amber-400/30 hover:text-muted-foreground'
                          : 'hover:border-amber-400 hover:text-amber-400'
                      )}
                    >
                      {p.is_featured ? t('admin.removeFeatured') : t('admin.toggleFeatured')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUnpublishConfirm(p.id)}
                      className="text-[10px] tracking-widest hover:border-red-400 hover:text-red-400"
                    >
                      {t('admin.unpublish')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Role change confirmation */}
      <ConfirmDialog
        open={roleConfirm !== null}
        onOpenChange={(open) => { if (!open) setRoleConfirm(null) }}
        title={t('admin.changeRole')}
        description={roleConfirm ? t('admin.changeRoleConfirm', { role: roleConfirm.newRole }) : ''}
        confirmLabel={t('admin.changeRoleBtn')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (roleConfirm) changeRole(roleConfirm.userId, roleConfirm.newRole)
        }}
      />

      {/* Unpublish confirmation */}
      <ConfirmDialog
        open={unpublishConfirm !== null}
        onOpenChange={(open) => { if (!open) setUnpublishConfirm(null) }}
        title={t('admin.unpublishProgram')}
        description={t('admin.unpublishConfirm')}
        confirmLabel={t('admin.unpublish')}
        cancelLabel={t('common.cancel')}
        variant="destructive"
        onConfirm={() => {
          if (unpublishConfirm) unpublishProgram(unpublishConfirm)
        }}
      />
    </div>
  )
}
