import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, UserPlus } from 'lucide-react'
import { useActivityFeed } from '@calistenia/core/hooks/useActivityFeed'
import { useWeeklyRanking } from '@calistenia/core/hooks/useWeeklyRanking'
import { cn } from '../lib/utils'
import { feedItemHref } from '../lib/feed-routes'
import { Button } from '../components/ui/button'
import FeaturedChallengeCard from '../components/FeaturedChallengeCard'
import ActivityFeedWidget from '../components/friends/ActivityFeedWidget'
import LeaderboardWidget from '../components/friends/LeaderboardWidget'
import ChallengesPage from './ChallengesPage'
import LeaderboardPage from './LeaderboardPage'

const TABS = ['activity', 'challenges', 'ranking'] as const
type CommunityTab = (typeof TABS)[number]

const TAB_LABEL: Record<CommunityTab, string> = {
  activity: 'community.tab.activity',
  challenges: 'community.tab.challenges',
  ranking: 'community.tab.ranking',
}

/** Sin `?tab` o con un valor desconocido se abre Actividad. */
function parseTab(value: string | null): CommunityTab {
  return TABS.includes(value as CommunityTab) ? (value as CommunityTab) : 'activity'
}

interface CommunityPageProps {
  userId: string
}

/**
 * Tablero Comunidad (#857): junta lo social que estaba repartido en rutas
 * sueltas. No duplica pantallas: Retos y Ranking renderizan `ChallengesPage` y
 * `LeaderboardPage` en modo `embedded`, y sus rutas propias siguen vivas porque
 * las usan las push y los enlaces compartidos.
 *
 * La pestaña va en `?tab=` y se escribe con push (no replace): se puede enlazar
 * y el botón atrás vuelve a la pestaña anterior.
 */
export default function CommunityPage({ userId }: CommunityPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab = parseTab(rawTab)
  const tabRefs = useRef<Partial<Record<CommunityTab, HTMLButtonElement | null>>>({})

  // `?tab=` desconocido: se cae a Actividad y se limpia la URL (replace, sin
  // ensuciar el historial) para que no quede un enlace roto compartible.
  useEffect(() => {
    if (rawTab === null || TABS.includes(rawTab as CommunityTab)) return
    const params = new URLSearchParams(searchParams)
    params.delete('tab')
    setSearchParams(params, { replace: true })
  }, [rawTab, searchParams, setSearchParams])

  const selectTab = (next: CommunityTab) => {
    if (next === tab) return
    const params = new URLSearchParams(searchParams)
    if (next === 'activity') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params)
  }

  // Flechas entre pestañas, como pide el patrón ARIA de tablist.
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]
    selectTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <header className="flex flex-col gap-4 mb-6">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-1 uppercase">{t('community.kicker')}</div>
            <h1 className="font-bebas text-4xl md:text-5xl leading-none">{t('community.title')}</h1>
          </div>
          <Button
            onClick={() => navigate('/friends')}
            variant="outline"
            className="h-11 shrink-0 gap-2 text-[11px] tracking-widest uppercase"
          >
            <UserPlus className="size-4" aria-hidden="true" />
            {t('community.findFriends')}
          </Button>
        </div>

        <div
          role="tablist"
          aria-label={t('community.tabsAriaLabel')}
          className="grid grid-cols-3 gap-1 rounded-lg border border-border p-[3px]"
        >
          {TABS.map(id => (
            <button
              key={id}
              ref={el => { tabRefs.current[id] = el }}
              type="button"
              role="tab"
              id={`community-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`community-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => selectTab(id)}
              onKeyDown={onTabKeyDown}
              className={cn(
                'h-11 rounded-md text-[10px] font-medium tracking-widest uppercase transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tab === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(TAB_LABEL[id])}
            </button>
          ))}
        </div>
      </header>

      <div role="tabpanel" id={`community-panel-${tab}`} aria-labelledby={`community-tab-${tab}`}>
        {tab === 'activity' && <ActivityTab userId={userId} onSeeRanking={() => selectTab('ranking')} />}
        {tab === 'challenges' && <ChallengesPage userId={userId} embedded />}
        {tab === 'ranking' && <LeaderboardPage userId={userId} embedded />}
      </div>
    </div>
  )
}

// ── Actividad ────────────────────────────────────────────────────────────────

function ActivityTab({ userId, onSeeRanking }: { userId: string; onSeeRanking: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // Solo el resumen semanal: el ranking completo (9 consultas por persona) se
  // carga al abrir su pestaña.
  const { ranking, loading: rankingLoading, error: rankingError, reload: reloadRanking } = useWeeklyRanking(userId)
  const { items: feedItems, loading: feedLoading, load: loadFeed } = useActivityFeed(userId)

  useEffect(() => { void loadFeed() }, [loadFeed])

  // Con el ranking fallido no sabemos a cuánta gente sigue: NO es «no sigues a
  // nadie». Se avisa con reintento y el feed (que carga aparte) se queda.
  const followsNobody = !rankingLoading && !rankingError && ranking.followingCount === 0

  return (
    <div className="flex flex-col gap-6">
      {rankingError && (
        <section
          role="alert"
          data-testid="community-load-error"
          className="rounded-xl border border-border bg-card p-4 text-center"
        >
          <p className="text-sm text-muted-foreground mb-3">{t('community.loadError')}</p>
          <Button variant="outline" size="sm" className="h-11" onClick={reloadRanking}>
            {t('community.retry')}
          </Button>
        </section>
      )}

      {followsNobody && (
        <section
          data-testid="community-empty"
          className="rounded-xl border border-border bg-card p-5 text-center"
        >
          <h2 className="font-bebas text-2xl mb-1">{t('community.empty.title')}</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">{t('community.empty.hint')}</p>
          <Button onClick={() => navigate('/friends')} variant="limeSolid" className="h-11">
            {t('community.findFriends')}
          </Button>
        </section>
      )}

      <FeaturedChallengeCard userId={userId} onNavigate={navigate} />

      {!followsNobody && !feedLoading && (feedItems.length > 0 ? (
        <ActivityFeedWidget
          title={t('community.friendsTitle')}
          limit={4}
          items={feedItems}
          onNavigate={() => navigate('/feed')}
          onOpenSession={(item) => navigate(feedItemHref(item, item.userId === userId) ?? `/u/${item.userId}`)}
          onOpenUser={(uid) => navigate(`/u/${uid}`)}
        />
      ) : !rankingError && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">{t('community.friendsTitle')}</div>
          <p className="text-sm text-muted-foreground">{t('community.noFriendActivity')}</p>
        </section>
      ))}

      {ranking.top.length > 1 && (
        <LeaderboardWidget
          title={t('community.weeklyRanking')}
          entries={ranking.top}
          me={ranking.me}
          onNavigate={onSeeRanking}
        />
      )}

      <section aria-labelledby="community-more">
        <h2 id="community-more" className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">
          {t('community.more')}
        </h2>
        <div className="border-t border-border">
          <MoreLink to="/community-programs" title={t('community.link.programsTitle')} hint={t('community.link.programsHint')} />
          <MoreLink to="/races/discover" title={t('community.link.racesTitle')} hint={t('community.link.racesHint')} />
          <MoreLink to="/referrals" title={t('community.link.inviteTitle')} hint={t('community.link.inviteHint')} />
        </div>
      </section>
    </div>
  )
}

function MoreLink({ to, title, hint }: { to: string; title: string; hint: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 min-h-14 border-b border-border py-2 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
    </Link>
  )
}
