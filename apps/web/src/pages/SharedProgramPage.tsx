import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import type { ProgramMeta } from '@calistenia/core/types'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { usePublicProgramPreview } from '@calistenia/core/hooks/usePublicProgramPreview'
import { capturePendingSharedProgram } from '@calistenia/core/lib/sharedProgramHandoff'
import ProgramDetailPage from './ProgramDetailPage'
import { ArrowLeftIcon } from '../components/icons/nav-icons'

// ── SharedProgramPage ──────────────────────────────────────────────────────

interface SharedProgramPageProps {
  programId: string
  userId?: string
  activeProgram?: ProgramMeta | null
  onNavigateToProgram?: (programId: string) => void
  onSelectProgram?: (programId: string) => Promise<boolean>
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

  // If logged in, show the full program detail page
  if (isLoggedIn) {
    return (
      <ProgramDetailPage
        programId={programId}
        userId={userId}
        activeProgram={activeProgram}
        onBack={onBack}
        onNavigateToProgram={onNavigateToProgram}
        onSelectProgram={onSelectProgram}
        onDuplicateProgram={onDuplicateProgram}
        isSharedView={true}
        onLogin={onLogin}
      />
    )
  }

  // Not logged in: show a welcoming landing page
  return <SharedLanding programId={programId} onBack={onBack} onLogin={onLogin} />
}

// ── Landing for non-logged-in users ────────────────────────────────────────

function SharedLanding({
  programId,
  onBack,
  onLogin,
}: {
  programId: string
  onBack: () => void
  onLogin: () => void
}) {
  const { t } = useTranslation()
  const l = useLocalize()

  /**
   * Los datos NO salen de `pb.collection('programs')`. El `viewRule` exige
   * sesión, así que quien llega por el enlace compartido —el destinatario
   * entero de esta página— recibía 404 y veía siempre «Programa no encontrado»
   * (#604). Vienen de `GET /api/programs/{id}/public`, la ruta de `pb_hooks`
   * que sirve un recorte de campos solo si el programa es `link` o `public`.
   */
  const { program, loading } = usePublicProgramPreview(programId)
  const exercises = program?.exercises ?? []

  /**
   * El id se guarda ANTES de mandar a registrarse. Sin esto, quien completa el
   * alta desde aquí aterriza en el dashboard y pierde el programa que venía a
   * ver, que es el último paso del embudo que este enlace existe para abrir.
   */
  const handleLogin = useCallback(() => {
    capturePendingSharedProgram(programId)
    onLogin()
  }, [programId, onLogin])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-20">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-16 bg-muted rounded w-2/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-12 bg-muted rounded w-48" />
        </div>
      </div>
    )
  }

  if (!program) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-20 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center">
          <svg className="size-8 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p className="text-muted-foreground text-sm mb-4">{t('programs.notFound')}</p>
        <button onClick={onBack} className="text-[11px] font-mono tracking-widest text-muted-foreground hover:text-foreground transition-colors uppercase">
          <ArrowLeftIcon className="size-4 inline mr-1.5" />
          {t('common.back')}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-12 md:py-20">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10">
        <ArrowLeftIcon className="size-4" />
        <span className="font-mono text-[11px] tracking-widest uppercase">{t('common.back')}</span>
      </button>

      {/* Badge */}
      <div className="inline-block mb-4">
        <span className="text-[10px] font-mono tracking-[0.3em] text-lime-400 bg-lime-400/10 px-3 py-1 rounded-full uppercase">
          {t('programs.sharedBadge')}
        </span>
      </div>

      {/* Program name */}
      <h1 className="font-bebas text-4xl md:text-7xl leading-none tracking-wide mb-4">{l(program.name)}</h1>

      {program.authorName && (
        <p className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase mb-4">
          {t('programs.sharedBy', { name: program.authorName })}
        </p>
      )}

      {l(program.description) && (
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl mb-6">{l(program.description)}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap mb-10">
        {program.durationWeeks > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-lime-400 font-bebas text-xl">{program.durationWeeks}</span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">{t('programs.weeks')}</span>
          </div>
        )}
        {program.phaseCount > 0 && (
          <>
            <div className="w-px h-5 bg-muted" />
            <div className="flex items-center gap-2">
              <span className="text-lime-400 font-bebas text-xl">{program.phaseCount}</span>
              <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">{t('programs.phaseUnit', { count: program.phaseCount })}</span>
            </div>
          </>
        )}
        {program.exerciseCount > 0 && (
          <>
            <div className="w-px h-5 bg-muted" />
            <div className="flex items-center gap-2">
              {/* El total real, no el tamaño de la vista previa: la ruta manda
                  los 8 primeros ejercicios pero cuenta todos. */}
              <span className="text-lime-400 font-bebas text-xl">{program.exerciseCount}</span>
              <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">{t('common.exercises')}</span>
            </div>
          </>
        )}
      </div>

      {/* Exercise preview list */}
      {exercises.length > 0 && (
        <div className="mb-10">
          <h2 className="font-bebas text-xl tracking-widest mb-4 uppercase text-muted-foreground">{t('programs.exercisePreview')}</h2>
          <div className="rounded-xl bg-muted/60 overflow-hidden divide-y divide-border/50">
            {exercises.map((ex, idx) => (
              <div key={idx} className="flex items-center gap-4 px-5 py-3.5">
                <span className="font-bebas text-base text-lime-400 w-14 text-center shrink-0 tracking-wide">
                  {ex.sets}x{ex.reps}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-foreground truncate">{l(ex.name)}</div>
                  {l(ex.muscles) && (
                    <div className="text-[11px] text-muted-foreground">
                      {l(ex.muscles).split(',').map(m => m.trim()).filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="limeSolid"
          onClick={handleLogin}
          className="font-bebas text-lg tracking-widest px-8 h-12 shadow-lg shadow-lime-400/10"
        >
          {t('programs.signUpToUse')}
        </Button>
        <Button
          variant="outline"
          onClick={handleLogin}
          className="font-mono text-[11px] tracking-widest h-12 px-6 border-border hover:border-muted-foreground hover:text-foreground"
        >
          {t('programs.alreadyHaveAccount')}
        </Button>
      </div>
    </div>
  )
}
