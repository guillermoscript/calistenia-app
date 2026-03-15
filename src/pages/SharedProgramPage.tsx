import ProgramDetailPage from './ProgramDetailPage'
import type { ProgramMeta } from '../types'

// ── SharedProgramPage ──────────────────────────────────────────────────────
//
// Landing page for shared program links (`/shared/:programId`).
// Wraps ProgramDetailPage with share-specific logic:
// - If user is logged in: show full detail with "Anadir a mis programas" button
// - If not logged in: show program preview with registration CTA

interface SharedProgramPageProps {
  programId: string
  userId?: string
  activeProgram?: ProgramMeta | null
  onNavigateToProgram?: (programId: string) => void
  onSelectProgram?: (programId: string) => Promise<void>
  onDuplicateProgram?: (programId: string) => Promise<void>
  onBack: () => void
  onLogin: () => void
}

export default function SharedProgramPage({
  programId,
  userId,
  activeProgram,
  onNavigateToProgram,
  onSelectProgram,
  onDuplicateProgram,
  onBack,
  onLogin,
}: SharedProgramPageProps) {
  const isLoggedIn = !!userId

  return (
    <ProgramDetailPage
      programId={programId}
      userId={userId}
      activeProgram={activeProgram}
      onBack={onBack}
      onNavigateToProgram={onNavigateToProgram}
      onSelectProgram={isLoggedIn ? onSelectProgram : undefined}
      onDuplicateProgram={isLoggedIn ? onDuplicateProgram : undefined}
      isSharedView={true}
      onLogin={onLogin}
    />
  )
}
