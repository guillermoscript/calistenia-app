import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, startTransition, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader } from './components/ui/loader'
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createQueryClient, createCorePersister, setupOnlineManager, PERSIST_MAX_AGE, PERSIST_BUSTER } from '@calistenia/core/lib/query-client'
import { useNutrition } from '@calistenia/core/hooks/useNutrition'
import { useCardioStats } from '@calistenia/core/hooks/useCardioStats'
import { WorkoutProvider, useWorkoutState, useWorkoutActions } from './contexts/WorkoutContext'
import { AuthProvider, useAuthState, useAuthActions } from './contexts/AuthContext'
// Eagerly loaded: core pages the user sees first
import DashboardPage from './pages/DashboardPage'
import WorkoutPage from './pages/WorkoutPage'
import AuthPage from './pages/AuthPage'
import LandingPage from './pages/LandingPage'
import { MarketingUnmask } from './components/MarketingUnmask'
import DiscoverySurvey from './components/DiscoverySurvey'
// Lazy loaded: secondary pages (split into separate chunks)
const BattleInviteLandingPage = lazy(() => import('./pages/BattleInviteLandingPage'))
const BattlePage = lazy(() => import('./pages/BattlePage'))
const BattleCreatePage = lazy(() => import('./pages/BattleCreatePage'))
const BattleHistoryPage = lazy(() => import('./pages/BattleHistoryPage'))
const ProgressPage = lazy(() => import('./pages/ProgressPage'))
const NutritionPage = lazy(() => import('./pages/NutritionPage'))
const MealLoggerPage = lazy(() => import('./pages/MealLoggerPage'))
const PantryPage = lazy(() => import('./pages/PantryPage'))
const ShoppingListPage = lazy(() => import('./pages/ShoppingListPage'))
const SavedRecipesPage = lazy(() => import('./pages/SavedRecipesPage'))
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
const LogWorkoutPage = lazy(() => import('./pages/LogWorkoutPage'))
const FreeProgressPage = lazy(() => import('./pages/FreeProgressPage'))
const ActiveSessionPage = lazy(() => import('./pages/ActiveSessionPage'))
const CardioSessionPage = lazy(() => import('./pages/CardioSessionPage'))
const CircuitPage = lazy(() => import('./pages/CircuitPage'))
const CircuitActivePage = lazy(() => import('./pages/CircuitActivePage'))
const CircuitSessionDetailPage = lazy(() => import('./pages/CircuitSessionDetailPage'))
const RacePage = lazy(() => import('./pages/RacePage'))
const RacesDiscoverPage = lazy(() => import('./pages/RacesDiscoverPage'))
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage'))
const PublicSessionDetailPage = lazy(() => import('./pages/PublicSessionDetailPage'))
const CardioSessionDetailPage = lazy(() => import('./pages/CardioSessionDetailPage'))
const FriendsPage = lazy(() => import('./pages/FriendsPage'))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'))
const AddFriendPage = lazy(() => import('./pages/AddFriendPage'))
const ActivityFeedPage = lazy(() => import('./pages/ActivityFeedPage'))
const ChallengesPage = lazy(() => import('./pages/ChallengesPage'))
const ChallengeDetailPage = lazy(() => import('./pages/ChallengeDetailPage'))
const CreateChallengePage = lazy(() => import('./pages/CreateChallengePage'))
// Programas de COMUNIDAD (#353) — distintos de los programas de entrenamiento.
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const CommunityProgramsPage = lazy(() => import('./pages/CommunityProgramsPage'))
const CommunityProgramDetailPage = lazy(() => import('./pages/CommunityProgramDetailPage'))
const RoutineViewPage = lazy(() => import('./pages/RoutineViewPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const NotificationSettingsPage = lazy(() => import('./pages/NotificationSettingsPage'))
const BlockedUsersPage = lazy(() => import('./pages/BlockedUsersPage'))
const LegalPage = lazy(() => import('./pages/LegalPage'))
const SleepPage = lazy(() => import('./pages/SleepPage'))
const InviteLandingPage = lazy(() => import('./pages/InviteLandingPage'))
const ReferralsPage = lazy(() => import('./pages/ReferralsPage'))
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'))
const BlogPage = lazy(() => import('./pages/BlogPage'))
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'))
const BlogLayout = lazy(() => import('./components/blog/BlogLayout'))
const DownloadPage = lazy(() => import('./pages/DownloadPage'))
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'))
const FeaturePage = lazy(() => import('./pages/FeaturePage'))
import OfflineBanner from './components/OfflineBanner'
import ActiveCardioBar from './components/cardio/ActiveCardioBar'
import ActiveSessionBubble from './components/ActiveFreeSessionBubble'
import { CardioSessionProvider } from './contexts/CardioSessionContext'
import { CircuitSessionProvider, useCircuitSession } from './contexts/CircuitSessionContext'
import { ActiveSessionProvider, useActiveSession } from './contexts/ActiveSessionContext'
import { useRestPreferences } from '@calistenia/core/hooks/useRestPreferences'
import InstallPrompt from './components/InstallPrompt'
import OnboardingFlow, { isOnboardingDone, markOnboardingDone } from './components/OnboardingFlow'
import { setupAutoSync } from '@calistenia/core/lib/offlineQueue'
import { pb } from '@calistenia/core/lib/pocketbase'
import { localDay } from '@calistenia/core/lib/dateUtils'
import { workoutTodayUrl } from './lib/workout-today-url'
import { consumePendingSharedProgram } from '@calistenia/core/lib/sharedProgramHandoff'
import { cn } from './lib/utils'
import { Toaster, toast } from 'sonner'
import { BackgroundJobsProvider } from './contexts/BackgroundJobsContext'
import { NotificationsProvider, useNotificationsContext } from './contexts/NotificationsContext'
import { NotificationBadge } from './components/social/NotificationBadge'
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
import { Separator } from './components/ui/separator'
import { ShieldIcon, PencilIcon, BellIcon } from './components/icons/nav-icons'
import { NAV_ITEMS, MOBILE_TABS, NAV_SECTIONS, isNavItemActive } from './lib/nav-routes'
import { useAutoRestoreNavigate } from './hooks/useAutoRestoreNavigate'

/** Reanuda la sesión de entreno persistida llevando a /session. */
function SessionRestoreNavigator() {
  const { isActive } = useActiveSession()
  useAutoRestoreNavigate(isActive, '/session')
  return null
}

/** Reanuda la sesión de circuito persistida llevando a /circuit/active. */
function CircuitRestoreNavigator() {
  const { isActive } = useCircuitSession()
  useAutoRestoreNavigate(isActive, '/circuit/active')
  return null
}


// ── Hoisted RegExp for breadcrumb matching ──────────────────────────────────
const RE_PROGRAM_EDIT = /^\/programs\/[^/]+\/edit$/
const RE_PROGRAM_DETAIL = /^\/programs\/[^/]+$/
const RE_EXERCISE_DETAIL = /^\/exercises\/[^/]+$/
const RE_SESSION_DETAIL = /^\/session\/[^/]+\/[^/]+$/
const RE_CHALLENGE_DETAIL = /^\/challenges\/[^/]+$/
const RE_COMMUNITY_PROGRAM_DETAIL = /^\/community-programs\/[^/]+$/
const RE_ADD_FRIEND = /^\/add\/[^/]+$/
const RE_SHARED_PROGRAM = /^\/shared\/[^/]+$/
const RE_USER_PROFILE = /^\/u\/[^/]+$/

/**
 * Título de la cabecera. `null` en Hoy (`/`, #856: fuera «Dashboard») y en las
 * rutas sin nombre propio, que antes caían a «Dashboard».
 */
function getBreadcrumbKey(pathname: string): string | null {
  if (pathname === '/') return null
  const exact = NAV_ITEMS.find(item => item.path === pathname)
  if (exact) return exact.labelKey
  if (pathname === '/programs/new') return 'breadcrumb.newProgram'
  if (RE_PROGRAM_EDIT.test(pathname)) return 'breadcrumb.editProgram'
  if (RE_PROGRAM_DETAIL.test(pathname)) return 'breadcrumb.programDetail'
  if (RE_EXERCISE_DETAIL.test(pathname)) return 'breadcrumb.exerciseDetail'
  if (RE_SESSION_DETAIL.test(pathname)) return 'breadcrumb.sessionDetail'
  if (pathname === '/battle-create') return 'battle.newBattle'
  if (pathname === '/battle-history') return 'battle.historyTitle'
  if (pathname.startsWith('/battle/')) return 'battle.title'
  if (pathname === '/challenges/new') return 'breadcrumb.newChallenge'
  if (RE_CHALLENGE_DETAIL.test(pathname)) return 'breadcrumb.challengeDetail'
  if (RE_COMMUNITY_PROGRAM_DETAIL.test(pathname)) return 'breadcrumb.communityProgramDetail'
  if (RE_ADD_FRIEND.test(pathname)) return 'breadcrumb.addFriend'
  if (pathname === '/log-workout') return 'breadcrumb.logWorkout'
  if (pathname === '/nutrition/log') return 'breadcrumb.logMeal'
  if (RE_SHARED_PROGRAM.test(pathname)) return 'breadcrumb.sharedProgram'
  if (pathname.match(/^\/u\/[^/]+\/routine$/)) return 'breadcrumb.routine'
  if (RE_USER_PROFILE.test(pathname)) return 'nav.profile'
  return null
}

const AppLoader: React.FC = () => (
  <Loader label="" size="lg" fullScreen />
)

// ── Mobile bottom tab bar ───────────────────────────────────────────────────


function MobileTabBar({ navigate, pathname }: { navigate: (p: string) => void; pathname: string }) {
  const { t } = useTranslation()
  const activeIndex = MOBILE_TABS.findIndex(tab => isNavItemActive(tab, pathname))
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
                aria-current={active ? 'page' : undefined}
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
  displayName: string
  userRole: import('@calistenia/core/types').UserRole
  children: ReactNode
}

/**
 * Marco de la app (#856): 5 destinos + «Atajos» en el sidebar, el avatar con
 * «Perfil y ajustes» al pie y una cabecera que solo lleva la campana (y el
 * avatar en móvil). Idioma, tema, fase y la guía se mudaron a Perfil.
 */
function AppShell({ displayName, userRole, children }: AppShellProps) {
  const { t } = useTranslation()
  const { open, isMobile, setOpenMobile } = useSidebar()
  const navigate = useNavigate()
  const location = useLocation()
  const { unreadCount } = useNotificationsContext()
  const initial = displayName?.[0]?.toUpperCase() ?? '?'
  const titleKey = getBreadcrumbKey(location.pathname)

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`)

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
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <div className="flex flex-col gap-5">
            {NAV_SECTIONS.map(section => (
              <nav key={section.key} aria-label={section.labelKey ? t(section.labelKey) : t('nav.mainNavigation')}>
                {section.labelKey && open ? (
                  <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t(section.labelKey)}</div>
                ) : null}
                <SidebarMenu>
                  {section.items.map(item => {
                    const { path, labelKey, icon: Icon } = item
                    const active = section.key === 'main' ? isNavItemActive(item, location.pathname) : isActive(path)
                    return (
                      <SidebarMenuItem key={path}>
                        <SidebarMenuButton
                          isActive={active}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => handleNav(path)}
                          tooltip={t(labelKey)}
                          className={section.key === 'shortcuts' ? 'text-muted-foreground' : undefined}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span>{t(labelKey)}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </nav>
            ))}
          </div>
        </SidebarContent>
        <SidebarFooter className="px-2 py-3">
          {(userRole === 'admin' || userRole === 'editor') ? (
            <SidebarMenu aria-label={t('nav.sectionManagement')}>
              {userRole === 'admin' ? (
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={isActive('/admin')} onClick={() => handleNav('/admin')} tooltip={t('nav.admin')} className="text-muted-foreground">
                    <ShieldIcon className="size-4 shrink-0" /><span>{t('nav.admin')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
              <SidebarMenuItem>
                <SidebarMenuButton isActive={isActive('/editor')} onClick={() => handleNav('/editor')} tooltip={t('nav.editor')} className="text-muted-foreground">
                  <PencilIcon className="size-4 shrink-0" /><span>{t('nav.editor')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}
          <Separator className="my-2 bg-border" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                isActive={isActive('/profile')}
                onClick={() => handleNav('/profile')}
                tooltip={t('nav.profileAndSettings')}
                data-testid="sidebar-profile"
              >
                <span className="size-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-foreground shrink-0">
                  {initial}
                </span>
                <span className="flex flex-col min-w-0 leading-tight">
                  <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('nav.profileAndSettings')}</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header data-testid="app-header" className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/95 backdrop-blur px-3 sm:px-4 sm:gap-3">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="h-4 bg-border hidden sm:block" />
          <nav aria-label="breadcrumb" className="flex-1 min-w-0">
            {titleKey ? <span className="text-sm font-medium text-foreground truncate block">{t(titleKey)}</span> : null}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2.5">
            <button
              onClick={() => handleNav('/notifications')}
              className="relative size-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-95 transition-all"
              aria-label={t('nav.notifications')}
              title={t('nav.notifications')}
            >
              <BellIcon className="size-4" />
              <NotificationBadge count={unreadCount} />
            </button>
            {/* En escritorio el avatar vive al pie del sidebar. */}
            <button
              onClick={() => handleNav('/profile')}
              className="sm:hidden size-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-foreground shrink-0 hover:ring-2 hover:ring-lime-500/40 active:scale-95 transition-all"
              aria-label={t('nav.profileAndSettings')}
              title={t('nav.profileAndSettings')}
            >
              {initial}
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

function ProgramDetailPageRoute({ userId, userRole }: { userId: string; userRole: import('@calistenia/core/types').UserRole }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { activeProgram, programProgress } = useWorkoutState()
  const { selectProgram, abandonProgram, duplicateProgram, deleteProgram } = useWorkoutActions()

  const goToPrograms = useCallback(() => navigate('/programs'), [navigate])
  const goToProgram = useCallback((pid: string) => navigate(`/programs/${pid}`), [navigate])
  const handleEdit = useCallback((pid: string) => navigate(`/programs/${pid}/edit`), [navigate])
  const handleDuplicate = useCallback(async (pid: string) => {
    const newId = await duplicateProgram(pid)
    if (newId) navigate(`/programs/${newId}/edit`)
  }, [duplicateProgram, navigate])
  const handleAbandon = useCallback(async (pid: string): Promise<boolean> => {
    const success = await abandonProgram(pid)
    if (success) {
      toast.success(t('programDetail.abandonSuccess'))
      navigate('/programs')
    } else {
      toast.error(t('programDetail.abandonError'))
    }
    return success
  }, [abandonProgram, navigate, t])
  const handleDelete = useCallback(async (pid: string) => {
    const success = await deleteProgram(pid)
    if (success) {
      toast.success(t('programs.deleteSuccess'))
      navigate('/programs')
    } else {
      toast.error(t('programs.deleteError'))
    }
  }, [deleteProgram, navigate, t])

  if (!id) return null
  return (
    <ProgramDetailPage
      programId={id} userId={userId} userRole={userRole} activeProgram={activeProgram}
      programProgress={programProgress}
      onBack={goToPrograms} onNavigateToProgram={goToProgram}
      onSelectProgram={selectProgram} onDuplicateProgram={handleDuplicate}
      onDeleteProgram={handleDelete} onAbandonProgram={handleAbandon} onEditProgram={handleEdit}
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
  cardioLastSession: import('@calistenia/core/types').CardioSession | null
}

function AuthenticatedApp({
  dark, toggleDark, onboardingDone, setOnboardingDone,
  nutritionGoals, cardioLastSession,
}: AuthenticatedAppProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, userId, userRole } = useAuthState()
  const { signOut } = useAuthActions()
  const { pbReady, programs, activeProgram, programsReady, programProgress } = useWorkoutState()
  const { selectProgram, getDoneDates } = useWorkoutActions()
  const { getRestForExercise, setRestForExercise } = useRestPreferences(userId ?? null)

  // Recover lost localStorage flag: if the user already has an enrolled
  // program when we first mount, they clearly completed onboarding — re-mark
  // and skip. Gated to run exactly once per user: otherwise selecting a
  // program during the live onboarding flow would re-trigger this and skip
  // the remaining steps.
  const recoveryCheckedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!pbReady || !programsReady || !user) return
    if (recoveryCheckedRef.current === user.id) return
    recoveryCheckedRef.current = user.id
    if (!isOnboardingDone(user.id) && activeProgram) {
      markOnboardingDone(user.id)
      setOnboardingDone(true)
    }
  }, [pbReady, programsReady, user, activeProgram, setOnboardingDone])

  if (!pbReady || !programsReady) return <AppLoader />

  const displayName = user?.display_name || user?.email?.split('@')[0] || ''

  if (!onboardingDone && user) {
    return (
      <OnboardingFlow
        displayName={displayName} programs={programs} activeProgram={activeProgram}
        userId={user.id} user={user} onSelectProgram={selectProgram}
        onCreateProgram={() => { markOnboardingDone(user.id); setOnboardingDone(true); navigate('/programs/new') }}
        onComplete={() => { setOnboardingDone(true); navigate(workoutTodayUrl(localDay())) }}
        onFirstMeasurement={() => { setOnboardingDone(true); navigate('/progress?tab=cuerpo') }}
        // En una sola transición: si el estado y la navegación fueran
        // actualizaciones separadas, el árbol autenticado se pintaría primero
        // con la ruta actual (tras el alta, `/auth`), y el comodín de <Routes>
        // haría `replace('/')` cancelando el `/session` pendiente (#694).
        onStartFirstWorkout={() => startTransition(() => { setOnboardingDone(true); navigate('/session') })}
      />
    )
  }

  return (
    <>
    <OfflineBanner />
    <BackgroundJobsProvider>
    <CardioSessionProvider userId={userId!} userWeight={nutritionGoals?.weight}>
    <CircuitSessionProvider userId={userId}>
    <ActiveSessionProvider getRestForExercise={getRestForExercise} setRestForExercise={setRestForExercise}>
    {/* Full-screen session pages render outside the app shell */}
    {location.pathname === '/session' ? (
      <Suspense fallback={<AppLoader />}>
        <ActiveSessionPage />
      </Suspense>
    ) : location.pathname === '/circuit/active' ? (
      <Suspense fallback={<AppLoader />}>
        <CircuitActivePage />
      </Suspense>
    ) : (
    <NotificationsProvider userId={userId ?? null}>
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppShell displayName={displayName} userRole={userRole}>
          <Suspense fallback={<AppLoader />}>
          <Routes>
            <Route path="/" element={
              <DashboardPage cardioLastSession={cardioLastSession} />
            } />
            <Route path="/workout" element={<WorkoutPage />} />
            <Route path="/lumbar" element={<LumbarPage user={user!} />} />
            <Route path="/nutrition" element={<NutritionPage userId={userId!} trainingPhase={programProgress.currentPhase} />} />
            <Route path="/nutrition/log" element={<MealLoggerPage userId={userId!} />} />
            <Route path="/pantry" element={<PantryPage userId={userId!} />} />
            <Route path="/pantry/shopping" element={<ShoppingListPage userId={userId!} />} />
            <Route path="/pantry/recipes" element={<SavedRecipesPage userId={userId!} />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/progress/free" element={<FreeProgressPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/profile" element={<ProfilePage user={user!} dark={dark} toggleDark={toggleDark} />} />
            <Route path="/reminders" element={<RemindersPage userId={userId!} />} />
            <Route path="/programs" element={<ProgramsPage />} />
            <Route path="/programs/new" element={<ProgramEditorPage userId={userId!} userRole={userRole} />} />
            <Route path="/programs/:id/edit" element={<ProgramEditorPage userId={userId!} userRole={userRole} />} />
            <Route path="/programs/:id" element={<ProgramDetailPageRoute userId={userId!} userRole={userRole} />} />
            <Route path="/exercises" element={<ExerciseLibraryPage />} />
            <Route path="/free-session" element={<FreeSessionPage />} />
            <Route path="/log-workout" element={<LogWorkoutPage />} />
            <Route path="/cardio" element={<CardioSessionPage userId={userId!} />} />
            <Route path="/races/discover" element={<RacesDiscoverPage />} />
            <Route path="/circuit" element={<CircuitPage />} />
            <Route path="/circuit/active" element={<CircuitActivePage />} />
            <Route path="/circuit/history/:id" element={<CircuitSessionDetailPage />} />
            <Route path="/sleep" element={<SleepPage userId={userId!} />} />
            <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
            <Route path="/session/:date/:workoutKey" element={<SessionDetailPage />} />
            {/* Detalle por id de sesión: sirve también para sesiones ajenas (muro, actividad). */}
            <Route path="/s/:id" element={<PublicSessionDetailPage />} />
            <Route path="/cardio/session/:id" element={<CardioSessionDetailPage />} />
            <Route path="/community" element={<CommunityPage userId={userId!} />} />
            <Route path="/battle/:id" element={<BattlePage userId={userId!} />} />
            <Route path="/battle-create" element={<BattleCreatePage userId={userId!} />} />
            <Route path="/battle-history" element={<BattleHistoryPage userId={userId!} />} />
            <Route path="/feed" element={<ActivityFeedPage userId={userId!} />} />
            <Route path="/community-programs" element={<CommunityProgramsPage userId={userId!} />} />
            <Route path="/community-programs/:id" element={<CommunityProgramDetailPage userId={userId!} />} />
            <Route path="/challenges" element={<ChallengesPage userId={userId!} />} />
            <Route path="/challenges/new" element={<CreateChallengePage userId={userId!} />} />
            <Route path="/challenges/:id" element={<ChallengeDetailPage userId={userId!} />} />
            <Route path="/friends" element={<FriendsPage userId={userId!} />} />
            <Route path="/leaderboard" element={<LeaderboardPage userId={userId!} />} />
            <Route path="/add/:userId" element={<AddFriendPage currentUserId={userId!} />} />
            <Route path="/u/:userId/routine" element={<RoutineViewPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings/notifications" element={<NotificationSettingsPage />} />
            <Route path="/settings/blocked" element={<BlockedUsersPage />} />
            <Route path="/referrals" element={<ReferralsPage userId={userId!} />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            {userRole === 'admin' ? <Route path="/admin" element={<AdminPage />} /> : null}
            {(userRole === 'editor' || userRole === 'admin') ? <Route path="/editor" element={<EditorPage />} /> : null}
            <Route path="/u/:userId" element={<UserProfilePage />} />
            <Route path="/shared/:shareCode" element={<SharedProgramPageRoute userId={userId ?? undefined} />} />
            <Route path="/legal" element={<LegalPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          <DiscoverySurvey userId={userId!} />
        </AppShell>
      </div>
    </SidebarProvider>
    </NotificationsProvider>
    )}
    {/* En el inicio el bloque «Hoy» ya enseña «Continuar» (#855). */}
    {location.pathname !== '/' && <ActiveCardioBar />}
    {location.pathname !== '/' && <ActiveSessionBubble />}
    <SessionRestoreNavigator />
    <CircuitRestoreNavigator />
    </ActiveSessionProvider>
    </CircuitSessionProvider>
    </CardioSessionProvider>
    </BackgroundJobsProvider>
    {/* No tapa el botón principal del inicio: espera al 2.º día de entreno (#855). */}
    <InstallPrompt enabled={getDoneDates().length >= 2} />
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
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- solo al cambiar de usuario; `user` entero re-dispararía en cada authRefresh

  useEffect(() => { return setupAutoSync(pb, () => queryClient.invalidateQueries()) }, [])

  /**
   * Cierra el embudo del enlace compartido (#604): quien llega a `/shared/:id`
   * sin cuenta, pulsa «Regístrate para usar este programa» y completa el alta,
   * aterrizaba en el dashboard sin rastro del programa que venía a ver. La
   * landing guarda el id antes de mandar a `/auth` y aquí se recoge.
   *
   * `consumePendingSharedProgram` es de un solo uso, así que este efecto puede
   * correr en cada render sin secuestrar la navegación: a partir de la segunda
   * vez no hay nada que consumir.
   */
  useEffect(() => {
    if (!userId) return
    const pendingProgram = consumePendingSharedProgram()
    if (pendingProgram) navigate(`/programs/${pendingProgram}`)
  }, [userId, navigate])

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

  const { goals: nutritionGoals } = useNutrition(userId)
  const { lastSession: cardioLastSession, loadStats: loadCardioStats } = useCardioStats(userId)

  useEffect(() => { if (userId) loadCardioStats() }, [userId, loadCardioStats])

  const goToDashboard = useCallback(() => navigate('/'), [navigate])
  const goToAuth = useCallback(() => navigate('/auth'), [navigate])

  if (!authReady) return <AppLoader />

  // Public blog — accessible both logged-in and logged-out
  if (location.pathname.startsWith('/blog')) {
    return <Suspense fallback={<Loader />}><MarketingUnmask><BlogLayout><Routes><Route path="/blog" element={<BlogPage />} /><Route path="/blog/:slug" element={<BlogPostPage />} /></Routes></BlogLayout></MarketingUnmask></Suspense>
  }

  // Public APK download page — accessible both logged-in and logged-out
  if (location.pathname === '/download' || location.pathname === '/descargar') {
    return <Suspense fallback={<Loader />}><MarketingUnmask><DownloadPage /></MarketingUnmask></Suspense>
  }

  // Public feature pages — accessible both logged-in and logged-out
  if (location.pathname === '/features' || location.pathname.startsWith('/features/')) {
    return (
      <Suspense fallback={<Loader />}>
        <MarketingUnmask>
          <Routes>
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/features/:slug" element={<FeaturePage />} />
          </Routes>
        </MarketingUnmask>
      </Suspense>
    )
  }

  // Public invite landing — accessible both logged-in and logged-out
  if (location.pathname.startsWith('/invite/')) {
    return <Suspense fallback={<Loader />}><Routes><Route path="/invite/:code/challenge/:challengeId" element={<InviteLandingPage />} /><Route path="/invite/:code" element={<InviteLandingPage />} /></Routes></Suspense>
  }

  // Battle invite landing — the shared link is a web URL, so it must resolve to
  // something on desktop and on phones without the app installed. Where the app IS
  // installed the app link intercepts it and this never renders.
  if (location.pathname.startsWith('/battle-invite/')) {
    return <Suspense fallback={<Loader />}><Routes><Route path="/battle-invite/:token" element={<BattleInviteLandingPage />} /></Routes></Suspense>
  }

  // Public race page — accessible pre-auth (shows login prompt if not authenticated)
  if (location.pathname.startsWith('/race/')) {
    return <Suspense fallback={<Loader />}><div className="min-h-screen bg-background"><Routes><Route path="/race/:id" element={<RacePage />} /></Routes></div></Suspense>
  }

  if (!user) {
    if (location.pathname === '/legal') return <Suspense fallback={<Loader />}><LegalPage /></Suspense>
    if (location.pathname.startsWith('/shared/')) {
      const shareCode = location.pathname.replace('/shared/', '')
      return <div className="min-h-screen bg-background"><SharedProgramPage programId={shareCode} onBack={goToDashboard} onLogin={goToAuth} /></div>
    }
    if (location.pathname === '/auth') return <AuthPage signInWithGoogle={signInWithGoogle} signInWithEmail={signInWithEmail} signUpWithEmail={signUpWithEmail} authError={authError} isLoading={isLoading} />
    return <MarketingUnmask><LandingPage onGetStarted={goToAuth} /></MarketingUnmask>
  }

  return (
    <WorkoutProvider userId={user.id}>
      <AuthenticatedApp
        dark={dark} toggleDark={toggleDark}
        onboardingDone={onboardingDone} setOnboardingDone={setOnboardingDone}
        nutritionGoals={nutritionGoals} cardioLastSession={cardioLastSession}
      />
    </WorkoutProvider>
  )
}

// Singletons a nivel módulo: un único QueryClient/persister por vida de la app.
setupOnlineManager()
const queryClient = createQueryClient()
const persister = createCorePersister()

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: PERSIST_BUSTER }}
    >
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}
