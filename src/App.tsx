import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, type ReactNode } from 'react'
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
import OfflineBanner from './components/OfflineBanner'
import ActiveCardioBar from './components/cardio/ActiveCardioBar'
import ActiveSessionBubble from './components/ActiveFreeSessionBubble'
import { CardioSessionProvider } from './contexts/CardioSessionContext'
import { ActiveSessionProvider, useActiveSession } from './contexts/ActiveSessionContext'
import { useRestPreferences } from './hooks/useRestPreferences'
import InstallPrompt from './components/InstallPrompt'
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
  label: string
  icon: React.FC<IconProps>
}

const NAV_ITEMS: NavItem[] = [
  { path: '/',          label: 'Dashboard',  icon: LayoutIcon },
  { path: '/workout',   label: 'Entrenar',   icon: DumbbellIcon },
  { path: '/lumbar',    label: 'Lumbar',      icon: SpineIcon },
  { path: '/progress',  label: 'Progreso',   icon: ChartIcon },
  { path: '/nutrition', label: 'Nutricion',  icon: NutritionIcon },
  { path: '/calendar',  label: 'Calendario', icon: CalendarNavIcon },
  { path: '/sleep',     label: 'Sueño',      icon: SleepIcon },
  { path: '/programs',  label: 'Programas',  icon: ProgramIcon },
  { path: '/exercises', label: 'Ejercicios', icon: ExerciseIcon },
  { path: '/free-session', label: 'Sesion Libre', icon: FreeSessionIcon },
  { path: '/cardio', label: 'Cardio', icon: RunningIcon },
  { path: '/feed', label: 'Actividad', icon: ActivityIcon },
  { path: '/friends', label: 'Amigos', icon: FriendsIcon },
  { path: '/leaderboard', label: 'Ranking', icon: TrophyIcon },
  { path: '/challenges', label: 'Desafios', icon: ChallengeIcon },
  { path: '/referrals', label: 'Referidos', icon: ReferralIcon },
  { path: '/notifications', label: 'Notificaciones', icon: BellIcon },
  { path: '/profile',   label: 'Perfil',     icon: ProfileIcon },
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

function getBreadcrumb(pathname: string): string {
  const exact = NAV_ITEMS.find(item => item.path === pathname)
  if (exact) return exact.label
  if (pathname === '/programs/new') return 'Nuevo Programa'
  if (RE_PROGRAM_EDIT.test(pathname)) return 'Editar Programa'
  if (RE_PROGRAM_DETAIL.test(pathname)) return 'Detalle Programa'
  if (RE_EXERCISE_DETAIL.test(pathname)) return 'Detalle Ejercicio'
  if (RE_SESSION_DETAIL.test(pathname)) return 'Detalle Sesion'
  if (pathname === '/feed') return 'Actividad'
  if (pathname === '/challenges') return 'Desafios'
  if (pathname === '/challenges/new') return 'Nuevo Desafio'
  if (RE_CHALLENGE_DETAIL.test(pathname)) return 'Detalle Desafio'
  if (pathname === '/friends') return 'Amigos'
  if (pathname === '/leaderboard') return 'Ranking'
  if (RE_ADD_FRIEND.test(pathname)) return 'Agregar Amigo'
  if (pathname === '/calendar') return 'Calendario'
  if (pathname === '/nutrition/log') return 'Registrar Comida'
  if (pathname === '/reminders') return 'Recordatorios'
  if (RE_SHARED_PROGRAM.test(pathname)) return 'Programa Compartido'
  if (pathname === '/sleep') return 'Sueño'
  if (pathname === '/free-session') return 'Sesion Libre'
  if (pathname === '/cardio') return 'Cardio'
  if (pathname === '/admin') return 'Admin'
  if (pathname === '/editor') return 'Editor'
  if (pathname.match(/^\/u\/[^/]+\/routine$/)) return 'Rutina'
  if (RE_USER_PROFILE.test(pathname)) return 'Perfil'
  if (pathname === '/notifications') return 'Notificaciones'
  if (pathname === '/referrals') return 'Referidos'
  return 'Dashboard'
}

const AppLoader: React.FC = () => (
  <Loader label="Cargando..." size="lg" fullScreen />
)

// ── Mobile bottom tab bar ───────────────────────────────────────────────────

const MOBILE_TABS: { path: string; label: string; icon: React.FC<IconProps> }[] = [
  { path: '/',          label: 'Inicio',     icon: LayoutIcon },
  { path: '/workout',   label: 'Entrenar',   icon: DumbbellIcon },
  { path: '/nutrition', label: 'Nutrición',  icon: NutritionIcon },
  { path: '/progress',  label: 'Progreso',   icon: ChartIcon },
  { path: '/profile',   label: 'Perfil',     icon: ProfileIcon },
]

function MobileTabBar({ navigate, pathname }: { navigate: (p: string) => void; pathname: string }) {
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
      aria-label="Navegación principal"
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
          {MOBILE_TABS.map(({ path, label, icon: Icon }, i) => {
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
                <span className={cn('text-[10px] tracking-wide transition-[font-weight,opacity] duration-200', active ? 'font-semibold' : 'font-medium')}>{label}</span>
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

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  { label: 'Entrenamiento', items: [
    { path: '/', label: 'Dashboard', icon: LayoutIcon },
    { path: '/workout', label: 'Entrenar', icon: DumbbellIcon },
    { path: '/free-session', label: 'Sesion Libre', icon: FreeSessionIcon },
    { path: '/cardio', label: 'Cardio', icon: RunningIcon },
    { path: '/lumbar', label: 'Lumbar', icon: SpineIcon },
  ]},
  { label: 'Seguimiento', items: [
    { path: '/progress', label: 'Progreso', icon: ChartIcon },
    { path: '/nutrition', label: 'Nutricion', icon: NutritionIcon },
    { path: '/sleep', label: 'Sueño', icon: SleepIcon },
    { path: '/calendar', label: 'Calendario', icon: CalendarNavIcon },
    { path: '/reminders', label: 'Recordatorios', icon: BellIcon },
  ]},
  { label: 'Explorar', items: [
    { path: '/programs', label: 'Programas', icon: ProgramIcon },
    { path: '/exercises', label: 'Ejercicios', icon: ExerciseIcon },
  ]},
  { label: 'Social', items: [
    { path: '/friends', label: 'Amigos', icon: FriendsIcon },
    { path: '/challenges', label: 'Desafios', icon: ChallengeIcon },
    { path: '/leaderboard', label: 'Ranking', icon: TrophyIcon },
    { path: '/referrals', label: 'Referidos', icon: ReferralIcon },
  ]},
]

function AppShell({ settings, displayName, signOut, dark, toggleDark, userRole, children }: AppShellProps) {
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
              <div key={section.label}>
                {open ? <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{section.label}</div> : null}
                <SidebarMenu>
                  {section.items.map(({ path, label, icon: Icon }) => (
                    <SidebarMenuItem key={path}>
                      <SidebarMenuButton isActive={isActive(path)} onClick={() => handleNav(path)} tooltip={label}>
                        <Icon className="size-4 shrink-0" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </div>
            ))}
            {(userRole === 'admin' || userRole === 'editor') ? (
              <div>
                {open ? <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Gestión</div> : null}
                <SidebarMenu>
                  {userRole === 'admin' ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={isActive('/admin')} onClick={() => handleNav('/admin')} tooltip="Admin">
                        <ShieldIcon className="size-4 shrink-0" /><span>Admin</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={isActive('/editor')} onClick={() => handleNav('/editor')} tooltip="Editor">
                      <PencilIcon className="size-4 shrink-0" /><span>Editor</span>
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
                <div className="text-[11px] text-muted-foreground">Fase {settings.phase}</div>
              </div>
            ) : null}
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleDark} tooltip={dark ? 'Modo claro' : 'Modo oscuro'} className="text-muted-foreground hover:text-foreground">
                {dark ? <SunIcon className="size-4 shrink-0" /> : <MoonIcon className="size-4 shrink-0" />}
                <span>{dark ? 'Modo claro' : 'Modo oscuro'}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} className="text-muted-foreground hover:text-destructive">
                <LogOutIcon className="size-4 shrink-0" /><span>Cerrar sesion</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {open ? (
            <div className="flex items-center gap-2 px-2 mt-2 text-[11px] text-muted-foreground">
              <Link to="/legal#privacy" className="hover:text-foreground transition-colors">Privacidad</Link>
              <span>·</span>
              <Link to="/legal#terms" className="hover:text-foreground transition-colors">Condiciones</Link>
            </div>
          ) : null}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/95 backdrop-blur px-3 sm:px-4 sm:gap-3">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="h-4 bg-border hidden sm:block" />
          <nav aria-label="breadcrumb" className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground truncate block">{getBreadcrumb(location.pathname)}</span>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <span className="hidden sm:inline-flex text-[11px] text-muted-foreground border border-border rounded px-2 py-0.5 font-mono">Fase {settings.phase}</span>
            <Button variant="ghost" size="icon" onClick={() => replayTourForPage(location.pathname)} className="hidden sm:inline-flex size-7 text-muted-foreground hover:text-foreground" aria-label="Guia de la pagina" title="Guia de la pagina">
              <span className="text-sm font-bold">?</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleDark} className="hidden sm:inline-flex size-7 text-muted-foreground hover:text-foreground" aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}>
              {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            </Button>
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
