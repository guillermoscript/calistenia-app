import { useState, useEffect, type ReactNode } from 'react'
import { useAuth } from './hooks/useAuth'
import { useProgress } from './hooks/useProgress'
import { usePrograms } from './hooks/usePrograms'
import WorkoutPage from './pages/WorkoutPage'
import DashboardPage from './pages/DashboardPage'
import LumbarPage from './pages/LumbarPage'
import ProgressPage from './pages/ProgressPage'
import AuthPage from './pages/AuthPage'
import ProgramEditorPage from './pages/ProgramEditorPage'
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

type TabId = 'dashboard' | 'workout' | 'lumbar' | 'progress'

interface IconProps {
  className?: string
}

interface TabDef {
  id: TabId
  label: string
  icon: React.FC<IconProps>
}

const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutIcon },
  { id: 'workout',   label: 'Entrenar',   icon: DumbbellIcon },
  { id: 'lumbar',    label: 'Lumbar',     icon: SpineIcon },
  { id: 'progress',  label: 'Progreso',   icon: ChartIcon },
]

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

// ── AppShell (uses sidebar context) ─────────────────────────────────────────

interface AppShellProps {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  settings: Settings
  displayName: string
  signOut: () => void
  dark: boolean
  toggleDark: () => void
  children: ReactNode
}

function AppShell({ activeTab, setActiveTab, settings, displayName, signOut, dark, toggleDark, children }: AppShellProps) {
  const { open } = useSidebar()

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
          <SidebarMenu>
            {TABS.map(({ id, label, icon: Icon }) => (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  isActive={activeTab === id}
                  onClick={() => setActiveTab(id)}
                  tooltip={label}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
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
            <span>Cerrar sesión</span>
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
              {TABS.find(t => t.id === activeTab)?.label}
            </span>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">
              Fase {settings.phase}
            </span>
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
        <main className="flex-1">
          {children}
        </main>
      </SidebarInset>
    </>
  )
}

// ── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [dark, setDark] = useState(false)
  const { user, authReady, authError, isLoading, signIn, signUp, signOut } = useAuth()

  const toggleDark = () => {
    setDark(d => {
      const next = !d
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }

  const {
    programs, activeProgram, phases, weekDays, getWorkout, selectProgram, duplicateProgram, programsReady,
  } = usePrograms(user?.id ?? null)

  const [showEditor, setShowEditor] = useState(false)
  const [editorProgramId, setEditorProgramId] = useState<string | null>(null)

  const {
    progress, settings, usePB, pbReady,
    logSet, markWorkoutDone, isWorkoutDone,
    getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
    getLongestStreak, updateSettings, getMonthActivity,
    getLastSessionDate,
  } = useProgress(user?.id ?? null, activeProgram?.id ?? null)

  if (!authReady) return <Loader />

  if (!user) {
    return (
      <AuthPage
        signIn={signIn}
        signUp={signUp}
        authError={authError}
        isLoading={isLoading}
      />
    )
  }

  const handleCreateProgram = () => {
    setEditorProgramId(null)
    setShowEditor(true)
  }

  const handleEditProgram = (programId: string) => {
    setEditorProgramId(programId)
    setShowEditor(true)
  }

  const handleDuplicateProgram = async (programId: string) => {
    const newId = await duplicateProgram(programId)
    if (newId) {
      setEditorProgramId(newId)
      setShowEditor(true)
    }
  }

  const handleEditorSaved = (_programId: string) => {
    setShowEditor(false)
    setEditorProgramId(null)
    // Force re-init by resetting — the programs list will refresh on next mount cycle
    // For now, just close. User can reload or switch programs.
  }

  if (!pbReady || !programsReady) return <Loader />

  const displayName = user.display_name || user.email?.split('@')[0] || ''

  return (
    <>
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppShell
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          settings={settings}
          displayName={displayName}
          signOut={signOut}
          dark={dark}
          toggleDark={toggleDark}
        >
          {activeTab === 'dashboard' && (
            <DashboardPage
              settings={settings} usePB={usePB}
              getTotalSessions={getTotalSessions} getLongestStreak={getLongestStreak}
              getWeeklyDoneCount={getWeeklyDoneCount} getMonthActivity={getMonthActivity}
              updateSettings={updateSettings} isWorkoutDone={isWorkoutDone}
              getLastSessionDate={getLastSessionDate} onGoToWorkout={() => setActiveTab('workout')}
              activeProgram={activeProgram} programs={programs}
              phases={phases} weekDays={weekDays}
              onSelectProgram={selectProgram}
              onCreateProgram={handleCreateProgram}
              onEditProgram={handleEditProgram}
              onDuplicateProgram={handleDuplicateProgram}
              userId={user.id}
            />
          )}
          {activeTab === 'workout' && (
            <WorkoutPage
              settings={settings} onLogSet={logSet} onMarkDone={markWorkoutDone}
              isWorkoutDone={isWorkoutDone} getExerciseLogs={getExerciseLogs}
              phases={phases} weekDays={weekDays} getWorkout={getWorkout}
              onGoToDashboard={() => setActiveTab('dashboard')}
            />
          )}
          {activeTab === 'lumbar' && <LumbarPage user={user} />}
          {activeTab === 'progress' && (
            <ProgressPage
              progress={progress} settings={settings}
              activeProgram={activeProgram}
            />
          )}
        </AppShell>
      </div>
    </SidebarProvider>

    {/* Program Editor Overlay */}
    {showEditor && (
      <ProgramEditorPage
        userId={user.id}
        programId={editorProgramId}
        onClose={() => { setShowEditor(false); setEditorProgramId(null) }}
        onSaved={handleEditorSaved}
      />
    )}
    </>
  )
}
