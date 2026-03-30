import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader } from './components/ui/loader'
import { Routes, Route, Navigate, useNavigate, useLocation, useParams, Link } from 'react-router-dom'
import { useNutrition } from './hooks/useNutrition'
import { useCardioStats } from './hooks/useCardioStats'
import { WorkoutProvider, useWorkoutState, useWorkoutActions } from './contexts/WorkoutContext'
import { AuthProvider, useAuthState, useAuthActions } from './contexts/AuthContext'
// Eagerly loaded: core pages the user sees first
import DashboardPage from './pages/DashboardPage'
import WorkoutPage from './pages/WorkoutPage'
import AuthPage from './pages/AuthPage'
import LandingPage from './pages/LandingPage'
// Lazy loaded: secondary pages (split into separate chunks)
const ProgressPage = lazy(() => import('./pages/ProgressPage'))
const NutritionPage = lazy(() => import('./pages/NutritionPage'))
const MealLoggerPage = lazy(() => import('./pages/MealLoggerPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const LumbarPage = lazy(() => import('./pages/LumbarPage'))
const ProgramsPage = lazy(() => import('./pages/ProgramsPage'))
const ProgramEditorPage = lazy(() => import('./pages/ProgramEditorPage'))
const ProgramDetailPage = lazy(() => import('./pages/ProgramDetailPage'))
const ExerciseLibraryPage = lazy(() => import('./pages/ExerciseLibraryPage'))
const ExerciseDetailPage = lazy(() => import('./pages/ExerciseDetailPage'))
const SharedProgramPage = lazy(() => import('./pages/SharedProgramPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const EditorPage = lazy(() => import('./pages/EditorPage'))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'))
const RemindersPage = lazy(() => import('./pages/RemindersPage'))
const FreeSessionPage = lazy(() => import('./pages/FreeSessionPage'))
const FreeProgressPage = lazy(() => import('./pages/FreeProgressPage'))
const ActiveSessionPage = lazy(() => import('./pages/ActiveSessionPage'))
const CardioSessionPage = lazy(() => import('./pages/CardioSessionPage'))
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage'))
const FriendsPage = lazy(() => import('./pages/FriendsPage'))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'))
const AddFriendPage = lazy(() => import('./pages/AddFriendPage'))
const ActivityFeedPage = lazy(() => import('./pages/ActivityFeedPage'))
const ChallengesPage = lazy(() => import('./pages/ChallengesPage'))
const ChallengeDetailPage = lazy(() => import('./pages/ChallengeDetailPage'))
const CreateChallengePage = lazy(() => import('./pages/CreateChallengePage'))
const RoutineViewPage = lazy(() => import('./pages/RoutineViewPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const LegalPage = lazy(() => import('./pages/LegalPage'))
const SleepPage = lazy(() => import('./pages/SleepPage'))
const InviteLandingPage = lazy(() => import('./pages/InviteLandingPage'))
const ReferralsPage = lazy(() => import('./pages/ReferralsPage'))
const BlogPage = lazy(() => import('./pages/BlogPage'))
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'))
const BlogEditorPage = lazy(() => import('./pages/BlogEditorPage'))
const BlogLayout = lazy(() => import('./components/blog/BlogLayout'))
import OfflineBanner from './components/OfflineBanner'
import ActiveCardioBar from './components/cardio/ActiveCardioBar'
import ActiveSessionBubble from './components/ActiveFreeSessionBubble'
import { CardioSessionProvider } from './contexts/CardioSessionContext'
import { ActiveSessionProvider, useActiveSession } from './contexts/ActiveSessionContext'
import { useRestPreferences } from './hooks/useRestPreferences'
import InstallPrompt from './components/InstallPrompt'
import WhatsNew, { WhatsNewButton } from './components/WhatsNew'
import OnboardingFlow, { isOnboardingDone, markOnboardingDone } from './components/OnboardingFlow'
import AppTour, { replayTourForPage } from './components/AppTour'
import { setupAutoSync } from './lib/offlineQueue'
import { pb } from './lib/pocketbase'
import { cn } from './lib/utils'
import { Toaster } from 'sonner'
import { BackgroundJobsProvider } from './contexts/BackgroundJobsContext'
import type { Settings } from './types'
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from './components/ui/sidebar'
import { Button } from './components/ui/button'
import { Separator } from './components/ui/separator'
import {
  type IconProps,
  LayoutIcon, DumbbellIcon, SpineIcon, ChartIcon, NutritionIcon,
  ProfileIcon, ProgramIcon, ExerciseIcon, RunningIcon, ChallengeIcon,
  ActivityIcon, FriendsIcon, TrophyIcon, FreeSessionIcon, CalendarNavIcon,
  ShieldIcon, PencilIcon, LogOutIcon, SunIcon, MoonIcon, SleepIcon, BellIcon,
  ReferralIcon,
} from './components/icons/nav-icons'

/** Auto-navigates to /session on mount if a persisted session exists */
function SessionRestoreNavigator() {
  const { isActive } = useActiveSession()
  const navigate = useNavigate()
  const location = useLocation()
  const hasNavigated = useRef(false)

  useEffect(() => {
    if (isActive && location.pathname !== '/session' && !hasNavigated.current) {
      hasNavigated.current = true
      navigate('/session', { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

interface NavItem {
  path: string
  labelKey: string
  icon: React.FC<IconProps>
}

const NAV_ITEMS: NavItem[] = [
  { path: '/',          labelKey: 'nav.dashboard',      icon: LayoutIcon },
  { path: '/workout',   labelKey: 'nav.workout',        icon: DumbbellIcon },
  { path: '/lumbar',    labelKey: 'nav.lumbar',          icon: SpineIcon },
  { path: '/progress',  labelKey: 'nav.progress',       icon: ChartIcon },
  { path: '/nutrition', labelKey: 'nav.nutrition',       icon: NutritionIcon },
  { path: '/calendar',  labelKey: 'nav.calendar',       icon: CalendarNavIcon },
  { path: '/sleep',     labelKey: 'nav.sleep',           icon: SleepIcon },
  { path: '/programs',  labelKey: 'nav.programs',        icon: ProgramIcon },
  { path: '/exercises', labelKey: 'nav.exercises',       icon: ExerciseIcon },
  { path: '/free-session', labelKey: 'nav.freeSession',  icon: FreeSessionIcon },
  { path: '/cardio',    labelKey: 'nav.cardio',          icon: RunningIcon },
  { path: '/feed',      labelKey: 'nav.activity',        icon: ActivityIcon },
  { path: '/friends',   labelKey: 'nav.friends',         icon: FriendsIcon },
  { path: '/leaderboard', labelKey: 'nav.leaderboard',   icon: TrophyIcon },
  { path: '/challenges', labelKey: 'nav.challenges',     icon: ChallengeIcon },
  { path: '/referrals', labelKey: 'nav.referrals',       icon: ReferralIcon },
  { path: '/notifications', labelKey: 'nav.notifications', icon: BellIcon },
  { path: '/profile',   labelKey: 'nav.profile',         icon: ProfileIcon },
]

// ── Hoisted RegExp for breadcrumb matching ──────────────────────────────────
const RE_PROGRAM_EDIT = /^\/programs\/[^/]+\/edit$/
const RE_PROGRAM_DETAIL = /^\/programs\/[^/]+$/
const RE_EXERCISE_DETAIL = /^\/exercises\/[^/]+$/
const RE_SESSION_DETAIL = /^\/session\/[^/]+\/[^/]+$/
const RE_CHALLENGE_DETAIL = /^\/challenges\/[^/]+$/
const RE_ADD_FRIEND = /^\/add\/[^/]+$/
const RE_SHARED_PROGRAM = /^\/shared\/[^/]+$/
const RE_USER_PROFILE = /^\/u\/[^/]+$/

function getBreadcrumbKey(pathname: string): string {
  const exact = NAV_ITEMS.find(item => item.path === pathname)
  if (exact) return exact.labelKey
  if (pathname === '/programs/new') return 'breadcrumb.newProgram'
  if (RE_PROGRAM_EDIT.test(pathname)) return 'breadcrumb.editProgram'
  if (RE_PROGRAM_DETAIL.test(pathname)) return 'breadcrumb.programDetail'
  if (RE_EXERCISE_DETAIL.test(pathname)) return 'breadcrumb.exerciseDetail'
  if (RE_SESSION_DETAIL.test(pathname)) return 'breadcrumb.sessionDetail'
  if (pathname === '/challenges/new') return 'breadcrumb.newChallenge'
  if (RE_CHALLENGE_DETAIL.test(pathname)) return 'breadcrumb.challengeDetail'
  if (RE_ADD_FRIEND.test(pathname)) return 'breadcrumb.addFriend'
  if (pathname === '/nutrition/log') return 'breadcrumb.logMeal'
  if (RE_SHARED_PROGRAM.test(pathname)) return 'breadcrumb.sharedProgram'
  if (pathname.match(/^\/u\/[^/]+\/routine$/)) return 'breadcrumb.routine'
  if (RE_USER_PROFILE.test(pathname)) return 'nav.profile'
  return 'nav.dashboard'
}

const AppLoader: React.FC = () => (
  <Loader label="" size="lg" fullScreen />
)

// ── Mobile bottom tab bar ───────────────────────────────────────────────────

const MOBILE_TABS: { path: string; labelKey: string; icon: React.FC<IconProps> }[] = [
  { path: '/',          labelKey: 'nav.home',       icon: LayoutIcon },
  { path: '/workout',   labelKey: 'nav.workout',    icon: DumbbellIcon },
  { path: '/feed',      labelKey: 'nav.activity',   icon: ActivityIcon },
  { path: '/progress',  labelKey: 'nav.progress',    icon: ChartIcon },
  { path: '/profile',   labelKey: 'nav.profile',     icon: ProfileIcon },
]

function MobileTabBar({ navigate, pathname }: { navigate: (p: string) => void; pathname: string }) {
  const { t } = useTranslation()
  const getActiveIndex = () => {
    for (let i = 0; i < MOBILE_TABS.length; i++) {
      const p = MOBILE_TABS[i].path
      if (p === '/' ? pathname === '/' : pathname.startsWith(p)) return i
    }
    return -1
  }
  const activeIndex = getActiveIndex()
  const tabWidthPercent = 100 / MOBILE_TABS.length

  return (
    <nav
      aria-label={t('nav.mainNavigation')}
      className="fixed bottom-0 left-0 right-0 z-50 sm:hidden border-t border-border/50 bg-background/95 backdrop-blur-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="relative">
        {activeIndex >= 0 ? (
          <div
            className="absolute top-0 h-[2px] transition-transform duration-[250ms] ease-[cubic-bezier(0.25,1,0.5,1)]"
            style={{ width: `${tabWidthPercent}%`, transform: `translateX(${activeIndex * 100}%)` }}
          >
            <div className="mx-auto w-10 h-full bg-lime-400 rounded-full" />
          </div>
        ) : null}
        <div className="flex items-stretch">
          {MOBILE_TABS.map(({ path, labelKey, icon: Icon }, i) => {
            const active = i === activeIndex
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] py-2 relative',
                  'transition-colors duration-200 ease-out',
                  active ? 'text-lime-400' : 'text-muted-foreground active:text-foreground',
                )}
              >
                <Icon className={cn('size-5 transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]', active ? 'scale-110' : '')} />
                <span className={cn('text-[10px] tracking-wide transition-[font-weight,opacity] duration-200', active ? 'font-semibold' : 'font-medium')}>{t(labelKey)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

// ── AppShell (uses sidebar context) ─────────────────────────────────────────

interface AppShellProps {
  settings: Settings
  displayName: string
  signOut: () => void
  dark: boolean
  toggleDark: () => void
  userRole: import('./types').UserRole
  children: ReactNode
}

const NAV_SECTIONS: { labelKey: string; items: NavItem[] }[] = [
  { labelKey: 'nav.sectionTraining', items: [
    { path: '/', labelKey: 'nav.dashboard', icon: LayoutIcon },
    { path: '/workout', labelKey: 'nav.workout', icon: DumbbellIcon },
    { path: '/free-session', labelKey: 'nav.freeSession', icon: FreeSessionIcon },
    { path: '/cardio', labelKey: 'nav.cardio', icon: RunningIcon },
    { path: '/lumbar', labelKey: 'nav.lumbar', icon: SpineIcon },
  ]},
  { labelKey: 'nav.sectionTracking', items: [
    { path: '/progress', labelKey: 'nav.progress', icon: ChartIcon },
    { path: '/nutrition', labelKey: 'nav.nutrition', icon: NutritionIcon },
    { path: '/sleep', labelKey: 'nav.sleep', icon: SleepIcon },
    { path: '/calendar', labelKey: 'nav.calendar', icon: CalendarNavIcon },
    { path: '/reminders', labelKey: 'nav.reminders', icon: BellIcon },
  ]},
  { labelKey: 'nav.sectionExplore', items: [
    { path: '/programs', labelKey: 'nav.programs', icon: ProgramIcon },
    { path: '/exercises', labelKey: 'nav.exercises', icon: ExerciseIcon },
  ]},
  { labelKey: 'nav.sectionSocial', items: [
    { path: '/friends', labelKey: 'nav.friends', icon: FriendsIcon },
    { path: '/challenges', labelKey: 'nav.challenges', icon: ChallengeIcon },
    { path: '/leaderboard', labelKey: 'nav.leaderboard', icon: TrophyIcon },
    { path: '/referrals', labelKey: 'nav.referrals', icon: ReferralIcon },
  ]},
]

function AppShell({ settings, displayName, signOut, dark, toggleDark, userRole, children }: AppShellProps) {
  const { t, i18n } = useTranslation()
  const { open, isMobile, setOpenMobile } = useSidebar()
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const handleNav = (path: string) => {
    navigate(path)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <>
      <Sidebar variant="sidebar" collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <div className="flex items-baseline gap-2 px-1">
            <span className="text-base font-bold tracking-tight text-foreground">Calistenia</span>
            <span className="text-xs text-muted-foreground">6M</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <div id="tour-sidebar-nav" className="flex flex-col gap-4">
            {NAV_SECTIONS.map((section) => (
              <div key={section.labelKey}>
                {open ? <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t(section.labelKey)}</div> : null}
                <SidebarMenu>
                  {section.items.map(({ path, labelKey, icon: Icon }) => (
                    <SidebarMenuItem key={path}>
                      <SidebarMenuButton isActive={isActive(path)} onClick={() => handleNav(path)} tooltip={t(labelKey)}>
                        <Icon className="size-4 shrink-0" />
                        <span>{t(labelKey)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </div>
            ))}
            {(userRole === 'admin' || userRole === 'editor') ? (
              <div>
                {open ? <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t('nav.sectionManagement')}</div> : null}
                <SidebarMenu>
                  {userRole === 'admin' ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={isActive('/admin')} onClick={() => handleNav('/admin')} tooltip={t('nav.admin')}>
                        <ShieldIcon className="size-4 shrink-0" /><span>{t('nav.admin')}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={isActive('/editor')} onClick={() => handleNav('/editor')} tooltip={t('nav.editor')}>
                      <PencilIcon className="size-4 shrink-0" /><span>{t('nav.editor')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
            ) : null}
          </div>
        </SidebarContent>
        <SidebarFooter className="px-2 py-3">
          <Separator className="mb-3 bg-border" />
          <div className="px-2 mb-2 flex items-center gap-2">
            <div className="size-7 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-foreground shrink-0">
              {displayName?.[0]?.toUpperCase() ?? '?'}
            </div>
            {open ? (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{displayName}</div>
                <div className="text-[11px] text-muted-foreground">{t('nav.phase')} {settings.phase}</div>
              </div>
            ) : null}
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleDark} tooltip={dark ? t('nav.lightMode') : t('nav.darkMode')} className="text-muted-foreground hover:text-foreground">
                {dark ? <SunIcon className="size-4 shrink-0" /> : <MoonIcon className="size-4 shrink-0" />}
                <span>{dark ? t('nav.lightMode') : t('nav.darkMode')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} className="text-muted-foreground hover:text-destructive">
                <LogOutIcon className="size-4 shrink-0" /><span>{t('nav.signOut')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {open ? (
            <div className="flex items-center gap-2 px-2 mt-2 text-[11px] text-muted-foreground">
              <Link to="/legal#privacy" className="hover:text-foreground transition-colors">{t('nav.privacy')}</Link>
              <span>·</span>
              <Link to="/legal#terms" className="hover:text-foreground transition-colors">{t('nav.terms')}</Link>
              <span>·</span>
              <WhatsNewButton className="hover:text-foreground transition-colors" />
            </div>
          ) : null}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/95 backdrop-blur px-3 sm:px-4 sm:gap-3">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="h-4 bg-border hidden sm:block" />
          <nav aria-label="breadcrumb" className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground truncate block">{t(getBreadcrumbKey(location.pathname))}</span>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2.5">
            {/* Language toggle — min 44px touch target on mobile */}
            <button
              onClick={() => i18n.changeLanguage(i18n.language.startsWith('en') ? 'es' : 'en')}
              className="inline-flex items-center h-8 sm:h-7 rounded-lg sm:rounded-md border border-border bg-muted/50 text-xs sm:text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-border/70 active:scale-95 transition-all overflow-hidden"
              aria-label={t('profile.language')}
              title={t('profile.language')}
            >
              <span className={cn('px-2 sm:px-1.5 py-1 sm:py-0.5 transition-colors', i18n.language.startsWith('es') ? 'bg-lime-500/15 text-lime-500' : '')}>ES</span>
              <span className={cn('px-2 sm:px-1.5 py-1 sm:py-0.5 transition-colors', i18n.language.startsWith('en') ? 'bg-lime-500/15 text-lime-500' : '')}>EN</span>
            </button>
            <span className="hidden sm:inline-flex text-[11px] text-muted-foreground border border-border rounded px-2 py-0.5 font-mono">{t('nav.phase')} {settings.phase}</span>
            <Button variant="ghost" size="icon" onClick={() => replayTourForPage(location.pathname)} className="hidden sm:inline-flex size-7 text-muted-foreground hover:text-foreground" aria-label={t('nav.pageGuide')} title={t('nav.pageGuide')}>
              <span className="text-sm font-bold">?</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleDark} className="hidden sm:inline-flex size-7 text-muted-foreground hover:text-foreground" aria-label={dark ? t('nav.lightMode') : t('nav.darkMode')}>
              {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            </Button>
            {/* Profile avatar — 32px on mobile for better touch target */}
            <button
              onClick={() => handleNav('/profile')}
              className="size-8 sm:size-7 rounded-full bg-accent flex items-center justify-center text-xs sm:text-[11px] font-semibold text-foreground shrink-0 hover:ring-2 hover:ring-lime-500/40 active:scale-95 transition-all"
              aria-label={t('nav.profile')}
              title={t('nav.profile')}
            >
              {displayName?.[0]?.toUpperCase() ?? '?'}
            </button>
          </div>
        </header>
        <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">{children}</main>
      </SidebarInset>
      <MobileTabBar navigate={navigate} pathname={location.pathname} />
    </>
  )
}

// ── Route wrappers ──────────────────────────────────────────────────────────

function ProgramDetailPageRoute({ userId, userRole }: { userId: string; userRole: import('./types').UserRole }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeProgram } = useWorkoutState()
  const { selectProgram, duplicateProgram, deleteProgram } = useWorkoutActions()

  const goToPrograms = useCallback(() => navigate('/programs'), [navigate])
  const goToProgram = useCallback((pid: string) => navigate(`/programs/${pid}`), [navigate])
  const handleEdit = useCallback((pid: string) => navigate(`/programs/${pid}/edit`), [navigate])
  const handleDuplicate = useCallback(async (pid: string) => {
    const newId = await duplicateProgram(pid)
    if (newId) navigate(`/programs/${newId}/edit`)
  }, [duplicateProgram, navigate])
  const handleDelete = useCallback(async (pid: string) => {
    const success = await deleteProgram(pid)
    if (success) navigate('/programs')
  }, [deleteProgram, navigate])

  if (!id) return null
  return (
    <ProgramDetailPage
      programId={id} userId={userId} userRole={userRole} activeProgram={activeProgram}
      onBack={goToPrograms} onNavigateToProgram={goToProgram}
      onSelectProgram={selectProgram} onDuplicateProgram={handleDuplicate}
      onDeleteProgram={handleDelete} onEditProgram={handleEdit}
    />
  )
}

function SharedProgramPageRoute({ userId }: { userId?: string }) {
  const { shareCode } = useParams<{ shareCode: string }>()
  const navigate = useNavigate()
  const { activeProgram } = useWorkoutState()
  const { selectProgram, duplicateProgram } = useWorkoutActions()

  const goToPrograms = useCallback(() => navigate('/programs'), [navigate])
  const goToProgram = useCallback((pid: string) => navigate(`/programs/${pid}`), [navigate])
  const goHome = useCallback(() => navigate('/'), [navigate])
  const handleDuplicate = useCallback(async (pid: string) => {
    const newId = await duplicateProgram(pid)
    if (newId) navigate(`/programs/${newId}/edit`)
  }, [duplicateProgram, navigate])

  if (!shareCode) return null
  return (
    <SharedProgramPage
      programId={shareCode} userId={userId} activeProgram={activeProgram}
      onNavigateToProgram={goToProgram} onBack={goToPrograms}
      onSelectProgram={selectProgram} onDuplicateProgram={handleDuplicate} onLogin={goHome}
    />
  )
}

// ── AuthenticatedApp — consumes contexts, renders routes ────────────────────

interface AuthenticatedAppProps {
  dark: boolean
  toggleDark: () => void
  onboardingDone: boolean
  setOnboardingDone: (v: boolean) => void
  nutritionGoals: { dailyCalories: number; weight?: number } | null
  cardioWeeklyStats: import('./hooks/useCardioStats').CardioAggregateStats
  cardioLastSession: import('./types').CardioSession | null
  nutritionTotals: { calories: number; protein: number; carbs: number; fat: number }
}

function AuthenticatedApp({
  dark, toggleDark, onboardingDone, setOnboardingDone,
  nutritionGoals, cardioWeeklyStats, cardioLastSession, nutritionTotals,
}: AuthenticatedAppProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, userId, userRole } = useAuthState()
  const { signOut } = useAuthActions()
  const { settings, pbReady, programs, activeProgram, programsReady } = useWorkoutState()
  const { selectProgram } = useWorkoutActions()
  const { getRestForExercise, setRestForExercise } = useRestPreferences(userId ?? null)

  if (!pbReady || !programsReady) return <AppLoader />

  const displayName = user?.display_name || user?.email?.split('@')[0] || ''

  if (!onboardingDone && user) {
    return (
      <OnboardingFlow
        displayName={displayName} programs={programs} activeProgram={activeProgram}
        userId={user.id} user={user} onSelectProgram={selectProgram}
        onCreateProgram={() => { markOnboardingDone(user.id); setOnboardingDone(true); navigate('/programs/new') }}
        onComplete={() => { setOnboardingDone(true); navigate('/') }}
      />
    )
  }

  return (
    <>
    <OfflineBanner />
    <BackgroundJobsProvider>
    <CardioSessionProvider userId={userId!} userWeight={nutritionGoals?.weight}>
    <ActiveSessionProvider getRestForExercise={getRestForExercise} setRestForExercise={setRestForExercise}>
    {/* Session page renders full-screen, outside the app shell */}
    {location.pathname === '/session' ? (
      <Suspense fallback={<AppLoader />}>
        <ActiveSessionPage />
      </Suspense>
    ) : (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppShell settings={settings} displayName={displayName} signOut={signOut} dark={dark} toggleDark={toggleDark} userRole={userRole}>
          <Suspense fallback={<AppLoader />}>
          <Routes>
            <Route path="/" element={
              <DashboardPage
                nutritionTotals={nutritionTotals} nutritionGoals={nutritionGoals}
                cardioWeeklyStats={cardioWeeklyStats} cardioLastSession={cardioLastSession}
              />
            } />
            <Route path="/workout" element={<WorkoutPage />} />
            <Route path="/lumbar" element={<LumbarPage user={user!} />} />
            <Route path="/nutrition" element={<NutritionPage userId={userId!} trainingPhase={settings.phase} />} />
            <Route path="/nutrition/log" element={<MealLoggerPage userId={userId!} />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/progress/free" element={<FreeProgressPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/profile" element={<ProfilePage user={user!} />} />
            <Route path="/reminders" element={<RemindersPage userId={userId!} />} />
            <Route path="/programs" element={<ProgramsPage />} />
            <Route path="/programs/new" element={<ProgramEditorPage userId={userId!} userRole={userRole} />} />
            <Route path="/programs/:id/edit" element={<ProgramEditorPage userId={userId!} userRole={userRole} />} />
            <Route path="/programs/:id" element={<ProgramDetailPageRoute userId={userId!} userRole={userRole} />} />
            <Route path="/exercises" element={<ExerciseLibraryPage />} />
            <Route path="/free-session" element={<FreeSessionPage />} />
            <Route path="/cardio" element={<CardioSessionPage userId={userId!} />} />
            <Route path="/sleep" element={<SleepPage userId={userId!} />} />
            <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
            <Route path="/session/:date/:workoutKey" element={<SessionDetailPage />} />
            <Route path="/feed" element={<ActivityFeedPage userId={userId!} />} />
            <Route path="/challenges" element={<ChallengesPage userId={userId!} />} />
            <Route path="/challenges/new" element={<CreateChallengePage userId={userId!} />} />
            <Route path="/challenges/:id" element={<ChallengeDetailPage userId={userId!} />} />
            <Route path="/friends" element={<FriendsPage userId={userId!} />} />
            <Route path="/leaderboard" element={<LeaderboardPage userId={userId!} />} />
            <Route path="/add/:userId" element={<AddFriendPage currentUserId={userId!} />} />
            <Route path="/u/:userId/routine" element={<RoutineViewPage />} />
            <Route path="/notifications" element={<NotificationsPage userId={userId!} />} />
            <Route path="/referrals" element={<ReferralsPage userId={userId!} />} />
            {userRole === 'admin' ? <Route path="/admin" element={<AdminPage />} /> : null}
            {(userRole === 'editor' || userRole === 'admin') ? <Route path="/editor" element={<EditorPage />} /> : null}
            {(userRole === 'editor' || userRole === 'admin') ? <Route path="/editor/blog" element={<BlogEditorPage />} /> : null}
            <Route path="/u/:userId" element={<UserProfilePage />} />
            <Route path="/shared/:shareCode" element={<SharedProgramPageRoute userId={userId} />} />
            <Route path="/legal" element={<LegalPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          <AppTour pathname={location.pathname} userId={userId!} autoStart />
        </AppShell>
      </div>
    </SidebarProvider>
    )}
    <ActiveCardioBar />
    <ActiveSessionBubble />
    <SessionRestoreNavigator />
    </ActiveSessionProvider>
    </CardioSessionProvider>
    </BackgroundJobsProvider>
    <InstallPrompt />
    <WhatsNew />
    <Toaster position="bottom-center" richColors closeButton />
    </>
  )
}

// ── Root App — thin: auth guard + providers ─────────────────────────────────

function AppInner() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('calistenia_dark_mode')
    const isDark = saved !== null ? saved === 'true' : true
    document.documentElement.classList.toggle('dark', isDark)
    return isDark
  })
  const [onboardingDone, setOnboardingDone] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, userId, authReady, authError, isLoading } = useAuthState()
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuthActions()

  useEffect(() => {
    if (user) setOnboardingDone(isOnboardingDone(user.id))
    else setOnboardingDone(false)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return setupAutoSync(pb) }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent).detail
      if (typeof url === 'string') navigate(url)
    }
    window.addEventListener('app:navigate', handler)
    return () => window.removeEventListener('app:navigate', handler)
  }, [navigate])

  const toggleDark = useCallback(() => {
    setDark(d => { const next = !d; document.documentElement.classList.toggle('dark', next); localStorage.setItem('calistenia_dark_mode', String(next)); return next })
  }, [])

  const { goals: nutritionGoals, getDailyTotals: getNutritionDailyTotals } = useNutrition(userId)
  const nutritionTotals = useMemo(() => getNutritionDailyTotals(), [getNutritionDailyTotals])
  const { weeklyStats: cardioWeeklyStats, lastSession: cardioLastSession, loadStats: loadCardioStats } = useCardioStats(userId)

  useEffect(() => { if (userId) loadCardioStats() }, [userId, loadCardioStats])

  const goToDashboard = useCallback(() => navigate('/'), [navigate])
  const goToAuth = useCallback(() => navigate('/auth'), [navigate])

  if (!authReady) return <AppLoader />

  // Public blog — accessible both logged-in and logged-out
  if (location.pathname.startsWith('/blog')) {
    return <Suspense fallback={<Loader />}><BlogLayout><Routes><Route path="/blog" element={<BlogPage />} /><Route path="/blog/:slug" element={<BlogPostPage />} /></Routes></BlogLayout></Suspense>
  }

  // Public invite landing — accessible both logged-in and logged-out
  if (location.pathname.startsWith('/invite/')) {
    return <Suspense fallback={<Loader />}><Routes><Route path="/invite/:code/challenge/:challengeId" element={<InviteLandingPage />} /><Route path="/invite/:code" element={<InviteLandingPage />} /></Routes></Suspense>
  }

  if (!user) {
    if (location.pathname === '/legal') return <Suspense fallback={<Loader />}><LegalPage /></Suspense>
    if (location.pathname.startsWith('/shared/')) {
      const shareCode = location.pathname.replace('/shared/', '')
      return <div className="min-h-screen bg-background"><SharedProgramPage programId={shareCode} onBack={goToDashboard} onLogin={goToAuth} /></div>
    }
    if (location.pathname === '/auth') return <AuthPage signInWithGoogle={signInWithGoogle} signInWithEmail={signInWithEmail} signUpWithEmail={signUpWithEmail} authError={authError} isLoading={isLoading} />
    return <LandingPage onGetStarted={goToAuth} />
  }

  return (
    <WorkoutProvider userId={user.id}>
      <AuthenticatedApp
        dark={dark} toggleDark={toggleDark}
        onboardingDone={onboardingDone} setOnboardingDone={setOnboardingDone}
        nutritionGoals={nutritionGoals} cardioWeeklyStats={cardioWeeklyStats}
        cardioLastSession={cardioLastSession} nutritionTotals={nutritionTotals}
      />
    </WorkoutProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
