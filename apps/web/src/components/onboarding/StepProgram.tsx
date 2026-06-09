import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import type { ProgramMeta } from '../../types'
import { matchUserToPrograms, type MatchUserInput } from '../../lib/matchPrograms'

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner: 'text-emerald-400 border-emerald-400/30',
  intermediate: 'text-amber-400 border-amber-400/30',
  advanced: 'text-red-400 border-red-400/30',
}

interface Props {
  programs: ProgramMeta[]
  selectedProgramId: string | null
  selecting: boolean
  userId?: string
  /** Full user signals used by matchUserToPrograms. */
  user: MatchUserInput
  onSelectProgram: (programId: string) => void
  onCreateProgram: () => void
  onBack: () => void
  onContinue: () => void
}

export function StepProgram({
  programs, selectedProgramId, selecting, userId, user,
  onSelectProgram, onCreateProgram, onBack, onContinue,
}: Props) {
  const { t } = useTranslation()

  const { primary, secondary, penalties } = matchUserToPrograms(user, programs)

  // Build the full ordered list:
  //   1. primary (FOR YOU) if non-null
  //   2. secondary (ALSO FOR YOU) if non-null
  //   3. the rest, sorted: featured > official > alpha
  const featuredSort = (a: ProgramMeta, b: ProgramMeta) => {
    if (a.is_featured && !b.is_featured) return -1
    if (!a.is_featured && b.is_featured) return 1
    if (a.is_official && !b.is_official) return -1
    if (!a.is_official && b.is_official) return 1
    return a.name.localeCompare(b.name)
  }
  const pinnedIds = new Set<string>([
    ...(primary ? [primary.id] : []),
    ...(secondary ? [secondary.id] : []),
  ])
  const rest = programs.filter(p => !pinnedIds.has(p.id)).sort(featuredSort)
  const ordered: Array<{ program: ProgramMeta; tier: 'primary' | 'secondary' | 'other' }> = [
    ...(primary ? [{ program: primary, tier: 'primary' as const }] : []),
    ...(secondary ? [{ program: secondary, tier: 'secondary' as const }] : []),
    ...rest.map(p => ({ program: p, tier: 'other' as const })),
  ]

  return (
    <div className="animate-[fadeUp_0.5s_ease]">
      <div className="text-center mb-4">
        <div className="font-bebas text-3xl mb-1">{t('onboarding.chooseProgramTitle')}</div>
        <div className="text-sm text-muted-foreground">{t('onboarding.chooseProgramDesc')}</div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/20 mb-4">
        <span className="text-amber-400 text-sm">★</span>
        <span className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: t('onboarding.recommendedHint') }} />
      </div>

      <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto pr-1">
        {ordered.map(({ program, tier }) => {
          const isSelected = selectedProgramId === program.id
          const isOwn = program.created_by === userId
          const programPenalties = penalties.get(program.id) || []
          return (
            <Card
              key={program.id}
              className={cn(
                'cursor-pointer transition-all duration-200 border-2',
                isSelected
                  ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/5'
                  : tier === 'primary'
                    ? 'border-[hsl(var(--lime))]/30 bg-[hsl(var(--lime))]/[0.03] hover:border-[hsl(var(--lime))]/50'
                    : tier === 'secondary'
                      ? 'border-sky-400/30 bg-sky-400/[0.03] hover:border-sky-400/50'
                      : program.is_featured
                        ? 'border-amber-400/20 bg-amber-400/[0.03] hover:border-amber-400/40'
                        : 'border-transparent hover:border-muted-foreground/20'
              )}
              onClick={() => onSelectProgram(program.id)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn(
                  'size-10 rounded-lg flex items-center justify-center shrink-0 text-lg font-bebas',
                  isSelected ? 'bg-[hsl(var(--lime))] text-background' : 'bg-muted text-muted-foreground'
                )}>
                  {isSelected ? '✓' : program.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('font-medium text-sm', isSelected && 'text-[hsl(var(--lime))]')}>
                      {program.name}
                    </span>
                    {tier === 'primary' && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-[hsl(var(--lime))] border-[hsl(var(--lime))]/50 bg-[hsl(var(--lime))]/10">
                        {t('onboarding.forYou')}
                      </Badge>
                    )}
                    {tier === 'secondary' && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-sky-400 border-sky-400/50 bg-sky-400/10">
                        {t('onboarding.alsoForYou')}
                      </Badge>
                    )}
                    {program.is_featured && tier !== 'primary' && tier !== 'secondary' && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-400 border-amber-400/30">
                        {t('onboarding.recommended')}
                      </Badge>
                    )}
                    {program.is_official && !program.is_featured && tier !== 'primary' && tier !== 'secondary' && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-emerald-400 border-emerald-400/30">
                        {t('onboarding.official')}
                      </Badge>
                    )}
                    {isOwn && !program.is_official && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-sky-500 border-sky-500/30">
                        {t('onboarding.yours')}
                      </Badge>
                    )}
                    {!isOwn && !program.is_official && program.created_by_name && (
                      <span className="text-[9px] text-muted-foreground">
                        {t('onboarding.by', { name: program.created_by_name })}
                      </span>
                    )}
                  </div>
                  {program.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {program.description}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">
                      {program.duration_weeks} {t('onboarding.weeks')}
                    </span>
                    {program.difficulty && (
                      <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0', DIFFICULTY_STYLES[program.difficulty] || '')}>
                        {t(`difficulty.${program.difficulty}`).toUpperCase()}
                      </Badge>
                    )}
                    {programPenalties.map(p => (
                      <Badge
                        key={p}
                        variant="outline"
                        className="text-[8px] px-1.5 py-0 text-amber-500 border-amber-500/40 bg-amber-500/10"
                      >
                        {t(`programs.penalty.${p === 'high_frequency' ? 'highFrequency' : p === 'equipment_missing' ? 'equipmentMissing' : 'healthFlag'}`)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card
        className="cursor-pointer border-2 border-dashed border-muted-foreground/20 hover:border-sky-500/40 transition-all"
        onClick={onCreateProgram}
      >
        <CardContent className="p-4 text-center">
          <div className="text-sm text-muted-foreground">
            <span className="text-sky-500 font-medium">{t('onboarding.createOwn')}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 mt-6">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 h-11 font-mono text-xs tracking-wide"
        >
          {t('onboarding.back')}
        </Button>
        <Button
          onClick={onContinue}
          disabled={!selectedProgramId || selecting}
          className="flex-1 h-11 font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background disabled:opacity-40"
        >
          {selecting ? t('onboarding.saving') : t('onboarding.continueBtn')}
        </Button>
      </div>
    </div>
  )
}
