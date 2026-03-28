import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { useWorkoutState } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'

export default function EditorPage() {
  const { t } = useTranslation()
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
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">{t('editor.section')}</div>
      <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
        <h1 className="font-bebas text-5xl">{t('editor.title')}</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate('/editor/blog')}
            variant="outline"
            className="font-bebas text-lg tracking-widest px-6 h-11"
          >
            Blog
          </Button>
          <Button
            onClick={onCreateProgram}
            className="bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-background font-bebas text-lg tracking-widest px-6 h-11"
          >
            {t('editor.newProgram')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-5">
            <div className="font-bebas text-4xl text-[hsl(var(--lime))]">{myOfficialPrograms.length}</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('editor.published')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="font-bebas text-4xl text-amber-400">{myOfficialPrograms.filter(p => p.is_featured).length}</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('editor.featured')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="font-bebas text-4xl text-sky-500">
              {myOfficialPrograms.reduce((sum, p) => sum + (p.duration_weeks || 0), 0)}
            </div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase">{t('editor.totalWeeks')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Programs list */}
      {myOfficialPrograms.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-muted-foreground text-sm mb-4">
            {t('editor.noPrograms')}
          </div>
          <Button
            onClick={onCreateProgram}
            variant="outline"
            className="text-[11px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
          >
            {t('editor.createFirst')}
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
                        {t('editor.featured')}
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
                      {t(`difficulty.${p.difficulty || 'beginner'}`).toUpperCase()}
                    </Badge>
                  </div>
                  {p.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {p.duration_weeks} {t('editor.weeks')}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditProgram(p.id)}
                  className="text-[10px] tracking-widest hover:border-[hsl(var(--lime))] hover:text-[hsl(var(--lime))]"
                >
                  {t('editor.edit')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
