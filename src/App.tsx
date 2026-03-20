import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useProgress } from './hooks/useProgress'
import { usePrograms } from './hooks/usePrograms'
import { useNutrition } from './hooks/useNutrition'
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
import OfflineBanner from './components/OfflineBanner'
import InstallPrompt from './components/InstallPrompt'
import OnboardingFlow, { isOnboardingDone, markOnboardingDone } from './components/OnboardingFlow'
import AppTour, { replayTourForPage } from './components/AppTour'
import { setupAutoSync } from './lib/offlineQueue'
import { pb } from './lib/pocketbase'
import { cn } from './lib/utils'
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

interface IconProps {
  className?: string
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
  { path: '/programs',  label: 'Programas',  icon: ProgramIcon },
  { path: '/exercises', label: 'Ejercicios', icon: ExerciseIcon },
  { path: '/profile',   label: 'Perfil',     icon: ProfileIcon },
]

// Map paths to breadcrumb labels (includes sub-routes)
function getBreadcrumb(pathname: string): string {
  // Check exact matches first
  const exact = NAV_ITEMS.find(item => item.path === pathname)
  if (exact) return exact.label

  // Sub-route patterns
  if (pathname === '/programs/new') return 'Nuevo Programa'
  if (pathname.match(/^\/programs\/[^/]+\/edit$/)) return 'Editar Programa'
  if (pathname.match(/^\/programs\/[^/]+$/)) return 'Detalle Programa'
  if (pathname.match(/^\/exercises\/[^/]+$/)) return 'Detalle Ejercicio'
  if (pathname === '/calendar') return 'Calendario'
  if (pathname === '/nutrition/log') return 'Registrar Comida'
  if (pathname.match(/^\/shared\/[^/]+$/)) return 'Programa Compartido'
  if (pathname === '/admin') return 'Admin'
  if (pathname === '/editor') return 'Editor'
  if (pathname.match(/^\/u\/[^/]+$/)) return 'Perfil'

  return 'Dashboard'
}

// ── Minimal inline SVG icons ────────────────────────────────────────────────
function LayoutIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  )
}
function DumbbellIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="6" width="3" height="4" rx="0.5" />
      <rect x="12" y="6" width="3" height="4" rx="0.5" />
      <line x1="4" y1="8" x2="12" y2="8" />
      <rect x="2.5" y="5" width="2" height="6" rx="0.5" />
      <rect x="11.5" y="5" width="2" height="6" rx="0.5" />
    </svg>
  )
}
function SpineIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="8" y1="1" x2="8" y2="15" />
      <rect x="5" y="3" width="6" height="2.5" rx="0.5" />
      <rect x="5" y="6.75" width="6" height="2.5" rx="0.5" />
      <rect x="5" y="10.5" width="6" height="2.5" rx="0.5" />
    </svg>
  )
}
function ChartIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="1,12 5,7 8,9 12,4 15,6" />
      <line x1="1" y1="14" x2="15" y2="14" />
    </svg>
  )
}
function NutritionIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 1v4a3 3 0 006 0V1" />
      <line x1="8" y1="8" x2="8" y2="15" />
      <line x1="5" y1="1" x2="5" y2="5" />
      <line x1="8" y1="1" x2="8" y2="4" />
      <line x1="11" y1="1" x2="11" y2="5" />
    </svg>
  )
}
function ProfileIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
    </svg>
  )
}
function ProgramIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="1" width="12" height="14" rx="1.5" />
      <line x1="5" y1="5" x2="11" y2="5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="11" x2="9" y2="11" />
    </svg>
  )
}
function ExerciseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8,4 8,8 11,10" />
    </svg>
  )
}
function CalendarNavIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="14" height="12" rx="1.5" />
      <line x1="1" y1="7" x2="15" y2="7" />
      <line x1="4" y1="1" x2="4" y2="4" />
      <line x1="12" y1="1" x2="12" y2="4" />
    </svg>
  )
}
function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1L2 4v4c0 3.5 2.5 6 6 7 3.5-1 6-3.5 6-7V4L8 1z" />
    </svg>
  )
}
function PencilIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
    </svg>
  )
}
function LogOutIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 2H2v12h4" />
      <polyline points="10,5 14,8 10,11" />
      <line x1="6" y1="8" x2="14" y2="8" />
    </svg>
  )
}

function SunIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="2.5" />
      <line x1="8" y1="13.5" x2="8" y2="15" />
      <line x1="1" y1="8" x2="2.5" y2="8" />
      <line x1="13.5" y1="8" x2="15" y2="8" />
      <line x1="3" y1="3" x2="4.1" y2="4.1" />
      <line x1="11.9" y1="11.9" x2="13" y2="13" />
      <line x1="13" y1="3" x2="11.9" y2="4.1" />
      <line x1="4.1" y1="11.9" x2="3" y2="13" />
    </svg>
  )
}
function MoonIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" />
    </svg>
  )
}
const Loader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-sm text-muted-foreground">Cargando...</div>
  </div>
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
  const isTabActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 sm:hidden border-t border-border bg-background/95 backdrop-blur-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch">
        {MOBILE_TABS.map(({ path, label, icon: Icon }) => {
          const active = isTabActive(path)
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors relative',
                active ? 'text-lime-400' : 'text-muted-foreground',
              )}
            >
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-lime-400 rounded-full" />
              )}
              <Icon className="size-[18px]" />
              <span className="text-[9px] font-mono tracking-wide">{label}</span>
            </button>
          )
        })}
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

function AppShell({ settings, displayName, signOut, dark, toggleDark, userRole, children }: AppShellProps) {
  const { open } = useSidebar()
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <>
      {/* Sidebar */}
      <Sidebar variant="sidebar" collapsible="icon">

        <SidebarHeader className="px-3 py-4">
          <div className="flex items-baseline gap-2 px-1">
            <span className="text-base font-bold tracking-tight text-foreground">Calistenia</span>
            <span className="text-xs text-muted-foreground">6M</span>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2">
          <SidebarMenu id="tour-sidebar-nav">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <SidebarMenuItem key={path}>
                <SidebarMenuButton
                  isActive={isActive(path)}
                  onClick={() => navigate(path)}
                  tooltip={label}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {/* Role-based nav items */}
            {userRole === 'admin' && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isActive('/admin')}
                  onClick={() => navigate('/admin')}
                  tooltip="Admin"
                >
                  <ShieldIcon className="size-4 shrink-0" />
                  <span>Admin</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {userRole === 'editor' && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isActive('/editor')}
                  onClick={() => navigate('/editor')}
                  tooltip="Editor"
                >
                  <PencilIcon className="size-4 shrink-0" />
                  <span>Editor</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="px-2 py-3">
          <Separator className="mb-3 bg-border" />
          <div className="px-2 mb-2 flex items-center gap-2">
            <div className="size-6 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-foreground shrink-0">
              {displayName?.[0]?.toUpperCase() ?? '?'}
            </div>
            {open && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{displayName}</div>
                <div className="text-xs text-muted-foreground">Fase {settings.phase}</div>
              </div>
            )}
          </div>
          <SidebarMenuButton onClick={signOut} className="text-muted-foreground hover:text-destructive">
            <LogOutIcon className="size-4 shrink-0" />
            <span>Cerrar sesion</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>

      {/* Main content area */}
      <SidebarInset>
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="h-4 bg-border" />
          {/* Breadcrumb-style current section */}
          <nav aria-label="breadcrumb">
            <span className="text-sm font-medium text-foreground">
              {getBreadcrumb(location.pathname)}
            </span>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">
              Fase {settings.phase}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => replayTourForPage(location.pathname)}
              className="size-7 text-muted-foreground hover:text-[hsl(var(--lime))]"
              aria-label="Guia de la pagina"
              title="Guia de la pagina"
            >
              <span className="text-sm font-bold">?</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDark}
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
            >
              {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 pb-16 sm:pb-0">
          {children}
        </main>
      </SidebarInset>

      {/* Mobile bottom tab bar */}
      <MobileTabBar navigate={navigate} pathname={location.pathname} />
    </>
  )
}

// ── Route wrappers (extract params and pass props) ──────────────────────────

function ProgramDetailPageRoute({
  userId, activeProgram, onSelectProgram, onDuplicateProgram, onDeleteProgram,
}: {
  userId: string
  activeProgram: import('./types').ProgramMeta | null
  onSelectProgram: (id: string) => Promise<void>
  onDuplicateProgram: (id: string) => Promise<void>
  onDeleteProgram: (id: string) => Promise<void>
}) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  if (!id) return null
  return (
    <ProgramDetailPage
      programId={id}
      userId={userId}
      activeProgram={activeProgram}
      onBack={() => navigate('/programs')}
      onNavigateToProgram={(pid) => navigate(`/programs/${pid}`)}
      onSelectProgram={onSelectProgram}
      onDuplicateProgram={onDuplicateProgram}
      onDeleteProgram={onDeleteProgram}
    />
  )
}

function SharedProgramPageRoute({
  userId, activeProgram, onSelectProgram, onDuplicateProgram,
}: {
  userId?: string
  activeProgram: import('./types').ProgramMeta | null
  onSelectProgram: (id: string) => Promise<void>
  onDuplicateProgram: (id: string) => Promise<void>
}) {
  const { shareCode } = useParams<{ shareCode: string }>()
  const navigate = useNavigate()
  if (!shareCode) return null
  return (
    <SharedProgramPage
      programId={shareCode}
      userId={userId}
      activeProgram={activeProgram}
      onNavigateToProgram={(pid) => navigate(`/programs/${pid}`)}
      onBack={() => navigate('/programs')}
      onSelectProgram={onSelectProgram}
      onDuplicateProgram={onDuplicateProgram}
      onLogin={() => navigate('/')}
    />
  )
}

// ── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('calistenia_dark_mode')
    const isDark = saved !== null ? saved === 'true' : true // default dark
    document.documentElement.classList.toggle('dark', isDark)
    return isDark
  })
  const [onboardingDone, setOnboardingDone] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, authReady, authError, isLoading, userRole, signIn, signUp, signOut } = useAuth()

  // Check onboarding status once user is known
  useEffect(() => {
    if (user) {
      setOnboardingDone(isOnboardingDone(user.id))
    } else {
      setOnboardingDone(false)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Setup offline queue auto-sync
  useEffect(() => {
    const cleanup = setupAutoSync(pb)
    return cleanup
  }, [])

  const toggleDark = () => {
    setDark(d => {
      const next = !d
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('calistenia_dark_mode', String(next))
      return next
    })
  }

  const {
    programs, activeProgram, phases, weekDays, getWorkout, selectProgram, duplicateProgram, deleteProgram, programsReady,
  } = usePrograms(user?.id ?? null)

  const { goals: nutritionGoals, getDailyTotals: getNutritionDailyTotals } = useNutrition(user?.id ?? null)

  const handleCreateProgram = () => {
    navigate('/programs/new')
  }

  const handleEditProgram = (programId: string) => {
    navigate(`/programs/${programId}/edit`)
  }

  const handleDuplicateProgram = async (programId: string) => {
    const newId = await duplicateProgram(programId)
    if (newId) {
      navigate(`/programs/${newId}/edit`)
    }
  }

  const handleDeleteProgram = async (programId: string) => {
    const success = await deleteProgram(programId)
    if (success) {
      navigate('/programs')
    }
  }

  const {
    progress, settings, usePB, pbReady,
    logSet: rawLogSet, markWorkoutDone, isWorkoutDone,
    getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
    getLongestStreak, updateSettings, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
  } = useProgress(user?.id ?? null, activeProgram?.id ?? null)

  // Wrap logSet to auto-detect PRs
  const logSet = async (exerciseId: string, workoutKey: string, setData: { reps: string; note: string; weight?: number }) => {
    await rawLogSet(exerciseId, workoutKey, setData)
    if (setData.reps) checkAndUpdatePR(exerciseId, setData.reps)
  }

  if (!authReady) return <Loader />

  if (!user) {
    // Allow shared program pages for non-authenticated users
    if (location.pathname.startsWith('/shared/')) {
      const shareCode = location.pathname.replace('/shared/', '')
      return (
        <div className="min-h-screen bg-background">
          <SharedProgramPage
            programId={shareCode}
            onBack={() => navigate('/')}
            onLogin={() => navigate('/auth')}
          />
        </div>
      )
    }
    if (location.pathname === '/auth') {
      return (
        <AuthPage
          signIn={signIn}
          signUp={signUp}
          authError={authError}
          isLoading={isLoading}
        />
      )
    }
    return <LandingPage onGetStarted={() => navigate('/auth')} />
  }

  if (!pbReady || !programsReady) return <Loader />

  const displayName = user.display_name || user.email?.split('@')[0] || ''

  // Show onboarding for first-time users
  if (!onboardingDone && user) {
    return (
      <OnboardingFlow
        displayName={displayName}
        programs={programs}
        activeProgram={activeProgram}
        userId={user.id}
        onSelectProgram={selectProgram}
        onCreateProgram={() => {
          markOnboardingDone(user.id)
          setOnboardingDone(true)
          navigate('/programs/new')
        }}
        onComplete={() => {
          setOnboardingDone(true)
          navigate('/')
        }}
      />
    )
  }

  return (
    <>
    <OfflineBanner />
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppShell
          settings={settings}
          displayName={displayName}
          signOut={signOut}
          dark={dark}
          toggleDark={toggleDark}
          userRole={userRole}
        >
          <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={
              <DashboardPage
                settings={settings} usePB={usePB}
                getTotalSessions={getTotalSessions} getLongestStreak={getLongestStreak}
                getWeeklyDoneCount={getWeeklyDoneCount} getMonthActivity={getMonthActivity}
                updateSettings={updateSettings} isWorkoutDone={isWorkoutDone}
                getLastSessionDate={getLastSessionDate} onGoToWorkout={() => navigate('/workout')}
                activeProgram={activeProgram} programs={programs}
                phases={phases} weekDays={weekDays}
                onSelectProgram={selectProgram}
                onCreateProgram={handleCreateProgram}
                onEditProgram={handleEditProgram}
                onDuplicateProgram={handleDuplicateProgram}
                userId={user.id}
                nutritionTotals={getNutritionDailyTotals()}
                nutritionGoals={nutritionGoals}
                onGoToNutrition={() => navigate('/nutrition')}
              />
            } />
            <Route path="/workout" element={
              <WorkoutPage
                settings={settings} onLogSet={logSet} onMarkDone={markWorkoutDone}
                isWorkoutDone={isWorkoutDone} getExerciseLogs={getExerciseLogs}
                phases={phases} weekDays={weekDays} getWorkout={getWorkout}
                onGoToDashboard={() => navigate('/')}
                userId={user.id}
                userRole={userRole}
              />
            } />
            <Route path="/lumbar" element={<LumbarPage user={user} />} />
            <Route path="/nutrition" element={<NutritionPage userId={user.id} trainingPhase={settings.phase} />} />
            <Route path="/nutrition/log" element={<MealLoggerPage userId={user.id} />} />
            <Route path="/progress" element={
              <ProgressPage
                progress={progress} settings={settings}
                activeProgram={activeProgram}
                userId={user.id}
              />
            } />
            <Route path="/calendar" element={
              <CalendarPage
                progress={progress}
                onGoToWorkout={() => navigate('/workout')}
                weekDays={weekDays}
                activeProgram={activeProgram}
                currentPhase={settings.phase}
              />
            } />
            <Route path="/profile" element={<ProfilePage user={user} />} />
            <Route path="/programs" element={
              <ProgramsPage
                programs={programs}
                activeProgram={activeProgram}
                userId={user.id}
                onSelectProgram={(id) => navigate(`/programs/${id}`)}
                onCreateProgram={handleCreateProgram}
                onDeleteProgram={handleDeleteProgram}
                onEditProgram={handleEditProgram}
              />
            } />
            <Route path="/programs/new" element={
              <ProgramEditorPage userId={user.id} userRole={userRole} />
            } />
            <Route path="/programs/:id/edit" element={
              <ProgramEditorPage userId={user.id} userRole={userRole} />
            } />
            <Route path="/programs/:id" element={
              <ProgramDetailPageRoute
                userId={user.id}
                activeProgram={activeProgram}
                onSelectProgram={selectProgram}
                onDuplicateProgram={handleDuplicateProgram}
                onDeleteProgram={handleDeleteProgram}
              />
            } />
            <Route path="/exercises" element={<ExerciseLibraryPage />} />
            <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
            {/* Role-gated routes */}
            {userRole === 'admin' && (
              <Route path="/admin" element={<AdminPage programs={programs} />} />
            )}
            {(userRole === 'editor' || userRole === 'admin') && (
              <Route path="/editor" element={
                <EditorPage
                  programs={programs}
                  userId={user.id}
                  onCreateProgram={handleCreateProgram}
                  onEditProgram={handleEditProgram}
                />
              } />
            )}
            <Route path="/u/:userId" element={
              <UserProfilePage
                currentUserId={user.id}
                currentUserPrs={settings as unknown as Record<string, number>}
                currentUserStreak={getLongestStreak()}
                currentUserSessions={getTotalSessions()}
              />
            } />
            <Route path="/shared/:shareCode" element={
              <SharedProgramPageRoute
                userId={user.id}
                activeProgram={activeProgram}
                onSelectProgram={selectProgram}
                onDuplicateProgram={handleDuplicateProgram}
              />
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          <AppTour pathname={location.pathname} userId={user.id} autoStart />
        </AppShell>
      </div>
    </SidebarProvider>

    <InstallPrompt />
    </>
  )
}
