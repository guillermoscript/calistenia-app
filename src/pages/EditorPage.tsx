import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { useWorkoutState } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'PRINCIPIANTE',
  intermediate: 'INTERMEDIO',
  advanced: 'AVANZADO',
}

export default function EditorPage() {
  const { programs } = useWorkoutState()
  const { userId } = useAuthState()
  const navigate = useNavigate()
  const onCreateProgram = useCallback(() => navigate('/programs/new'), [navigate])
  const onEditProgram = useCallback((id: string) => navigate(`/programs/${id}/edit`), [navigate])
  const myOfficialPrograms = useMemo(
    () => programs.filter(p => p.is_official && p.created_by === userId),
    [programs, userId]
  )

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">Panel editor</div>
      <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
        <h1 className="font-bebas text-5xl">MIS PROGRAMAS OFICIALES</h1>
        <Button
          onClick={onCreateProgram}
          className="bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background font-bebas text-lg tracking-widest px-6 h-11"
        >
          + NUEVO PROGRAMA OFICIAL
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-5">
            <div className="font-bebas text-4xl text-[hsl(var(--lime))]">{myOfficialPrograms.length}</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Publicados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="font-bebas text-4xl text-amber-400">{myOfficialPrograms.filter(p => p.is_featured).length}</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Destacados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="font-bebas text-4xl text-sky-500">
              {myOfficialPrograms.reduce((sum, p) => sum + (p.duration_weeks || 0), 0)}
            </div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Semanas totales</div>
          </CardContent>
        </Card>
      </div>

      {/* Programs list */}
      {myOfficialPrograms.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-muted-foreground text-sm mb-4">
            No has publicado ningun programa oficial todavia.
          </div>
          <Button
            onClick={onCreateProgram}
            variant="outline"
            className="text-[11px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
          >
            CREAR TU PRIMER PROGRAMA
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {myOfficialPrograms.map(p => (
            <Card key={p.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="p-5 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bebas text-xl tracking-wide">{p.name}</span>
                    {p.is_featured && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-amber-400 border-amber-400/30">
                        DESTACADO
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] px-1.5 py-0',
                        p.difficulty === 'advanced' && 'text-red-400 border-red-400/30',
                        p.difficulty === 'intermediate' && 'text-amber-400 border-amber-400/30',
                        (!p.difficulty || p.difficulty === 'beginner') && 'text-emerald-400 border-emerald-400/30',
                      )}
                    >
                      {DIFFICULTY_LABELS[p.difficulty || 'beginner']}
                    </Badge>
                  </div>
                  {p.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {p.duration_weeks} semanas
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditProgram(p.id)}
                  className="text-[10px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
                >
                  EDITAR
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
