import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Loader } from '../components/ui/loader'
import { cn } from '../lib/utils'
import { ShareButton } from '../components/ShareButton'
import { shareRoutine } from '../lib/share'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { useRoutineView } from '@calistenia/core/hooks/useRoutineView'
import { resolveExerciseNameField } from '@calistenia/core/lib/exercise-resolver'
import { inferTimerFromReps } from '@calistenia/core/lib/exercise-timer-inference'

export default function RoutineViewPage() {
  const { t } = useTranslation()
  const l = useLocalize()
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  // La rutina la sirve core (#473): dos olas de consultas en vez de cuatro en
  // cascada, y el join fases × días en una función pura. Los textos llegan
  // crudos, así que se localizan al pintar.
  const { userName, program, phaseGroups, noProgram, loading } = useRoutineView(userId ?? null)

  // Textos del programa ya localizados. Con `program` a null (error de carga) se
  // quedan vacíos, igual que hacían los `useState` de antes.
  const programName = program ? l(program.name) : ''
  const programDescription = program ? l(program.description) : ''
  const durationWeeks = program?.durationWeeks ?? 0

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Loader label={t('routine.loading')} />
      </div>
    )
  }

  if (noProgram) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/u/${userId}`)}
          className="text-[10px] tracking-widest text-muted-foreground hover:text-foreground mb-6"
        >
          &larr; Volver al perfil
        </Button>
        <div className="text-center text-muted-foreground text-sm py-12">
          Este usuario no tiene un programa activo
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/u/${userId}`)}
        className="text-[10px] tracking-widest text-muted-foreground hover:text-foreground mb-6"
      >
        &larr; Volver al perfil
      </Button>

      {/* Header */}
      <div className="mb-8">
        <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1">
          Programa actual de {userName}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-bebas text-3xl sm:text-4xl leading-none">{programName}</h1>
          {userId && (
            <ShareButton
              onShare={(method) => shareRoutine(userName, programName, userId, method)}
              className="shrink-0 hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
            />
          )}
        </div>
        {durationWeeks > 0 && (
          <div className="text-xs text-muted-foreground mt-1">{durationWeeks} semanas</div>
        )}
        {programDescription && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{programDescription}</p>
        )}
      </div>

      {/* Phases */}
      <div className="space-y-8">
        {phaseGroups.map(({ phase, days }) => (
          <div key={phase.id}>
            {/* Phase header */}
            <div
              className="flex items-center gap-3 mb-4"
            >
              <div
                className="w-1 h-8 rounded-full"
                style={{ backgroundColor: phase.color || 'hsl(var(--lime))' }}
              />
              <div>
                <div className="font-bebas text-xl leading-none">{l(phase.name)}</div>
                {phase.weeks > 0 && (
                  <div className="text-[10px] text-muted-foreground tracking-widest mt-0.5">
                    {phase.weeks} semanas
                  </div>
                )}
              </div>
            </div>

            {/* Days */}
            <div className="space-y-3 ml-2">
              {days.map((day) => {
                // `day_focus` viene crudo: se localiza antes de comprobarlo,
                // porque un `{"es":""}` sería truthy como objeto.
                const dayFocus = l(day.day_focus)
                return (
                <Card key={day.day_id}>
                  <CardContent className="p-4">
                    {/* Day header */}
                    <div className="flex items-center gap-2 mb-3">
                      {day.day_color && (
                        <div
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: day.day_color }}
                        />
                      )}
                      <div className="text-sm font-medium">{l(day.day_name)}</div>
                      {dayFocus && (
                        <span className="text-xs text-muted-foreground">- {dayFocus}</span>
                      )}
                    </div>

                    {/* Exercises */}
                    <div className="space-y-2">
                      {day.exercises.map((ex) => {
                        // `muscles` es un campo traducible: localizar ANTES de
                        // partir por comas, o `.split` explota en runtime.
                        const muscles = l(ex.muscles).split(',').map(m => m.trim()).filter(Boolean)
                        // Un `exercise_name` que es un slug del catálogo
                        // («sphinx_pushup») se pintaba crudo aquí, mientras la
                        // ficha del programa ya lo resolvía (#690).
                        const name = l(resolveExerciseNameField(ex.exercise_name, ex.exercise_id))
                        // Misma deducción que en la sesión: una fila con
                        // `is_timer: false` cuyo `reps` es una duración pura
                        // enseñaba «3x45s» en vez de los 45 s que dura.
                        const inferredTimer = ex.is_timer ? null : inferTimerFromReps(ex.reps)
                        const timerSeconds = ex.is_timer
                          ? ex.timer_seconds
                          : (ex.timer_seconds || inferredTimer?.timerSeconds)
                        return (
                        <div
                          key={ex.id}
                          className="flex items-start justify-between gap-2 py-1.5 border-b border-border/50 last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{name}</div>
                            {muscles.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {muscles.map((muscle) => (
                                  <span
                                    key={muscle}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                  >
                                    {muscle}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn('text-sm font-medium', 'text-[hsl(var(--lime))]')}>
                              {(ex.is_timer || inferredTimer) && timerSeconds
                                ? `${timerSeconds}s`
                                : `${ex.sets}x${ex.reps}`
                              }
                            </div>
                            {ex.rest_seconds > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                {ex.rest_seconds}s desc.
                              </div>
                            )}
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
