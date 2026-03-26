import { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { cn } from '../../lib/utils'
import { pb } from '../../lib/pocketbase'
import { shareContent } from '../../lib/share'
import { localize } from '../../lib/i18n-db'

const DURATION_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 14, label: '14 dias' },
  { value: 30, label: '30 dias' },
]

const BASE_URL = 'https://gym.guille.tech'

interface ChallengeExpressFormProps {
  referralCode: string | null
  userId: string
  onCreateChallenge: (exerciseId: string, durationDays: number, dailyTarget: number, title?: string) => Promise<string | null>
  onClose: () => void
}

interface Exercise {
  id: string
  name: string
}

export function ChallengeExpressForm({ referralCode, userId, onCreateChallenge, onClose }: ChallengeExpressFormProps) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [exerciseId, setExerciseId] = useState('')
  const [duration, setDuration] = useState(7)
  const [dailyTarget, setDailyTarget] = useState('')
  const [exerciseSearch, setExerciseSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const loadExercises = async () => {
      try {
        const res = await pb.collection('exercises_catalog').getList(1, 200, {
          sort: 'name',
          fields: 'id,name',
          $autoCancel: false,
        })
        setExercises(res.items.map((e: any) => ({ id: e.id, name: localize(e.name, 'es') })))
      } catch { /* */ }
    }
    loadExercises()
  }, [])

  const filtered = exerciseSearch
    ? exercises.filter(e => e.name.toLowerCase().includes(exerciseSearch.toLowerCase())).slice(0, 8)
    : exercises.slice(0, 8)

  const selectedExercise = exercises.find(e => e.id === exerciseId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!exerciseId || !dailyTarget) return

    setSubmitting(true)
    const challengeId = await onCreateChallenge(exerciseId, duration, parseInt(dailyTarget, 10))
    setSubmitting(false)

    if (challengeId && referralCode) {
      const inviteUrl = `${BASE_URL}/invite/${referralCode}/challenge/${challengeId}`
      await shareContent({
        title: 'Te reto a un challenge!',
        text: `💪 Te reto a un challenge express en Calistenia App!`,
        url: inviteUrl,
      })
    }

    onClose()
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] text-muted-foreground tracking-widest uppercase">CHALLENGE EXPRESS</div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Exercise selector */}
        <div className="flex flex-col gap-1.5 relative">
          <Label className="text-xs tracking-widest uppercase text-muted-foreground">Ejercicio</Label>
          <Input
            type="text"
            placeholder="Buscar ejercicio..."
            value={selectedExercise ? selectedExercise.name : exerciseSearch}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setExerciseSearch(e.target.value)
              setExerciseId('')
              setShowDropdown(true)
            }}
            onFocus={() => setShowDropdown(true)}
            className="bg-background border-border h-10 text-foreground placeholder:text-muted-foreground"
          />
          {showDropdown && !exerciseId && (
            <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filtered.map(ex => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => {
                    setExerciseId(ex.id)
                    setExerciseSearch('')
                    setShowDropdown(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  {ex.name}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</div>
              )}
            </div>
          )}
        </div>

        {/* Duration chips */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs tracking-widest uppercase text-muted-foreground">Duracion</Label>
          <div className="flex gap-2">
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDuration(opt.value)}
                className={cn(
                  'flex-1 h-9 rounded-lg border text-sm transition-colors',
                  duration === opt.value
                    ? 'border-[hsl(var(--lime))] bg-[hsl(var(--lime))]/10 text-[hsl(var(--lime))]'
                    : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Daily target */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs tracking-widest uppercase text-muted-foreground">Meta diaria (reps)</Label>
          <Input
            type="number"
            min="1"
            placeholder="Ej: 50"
            value={dailyTarget}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDailyTarget(e.target.value)}
            required
            className="bg-background border-border h-10 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <Button
          type="submit"
          disabled={!exerciseId || !dailyTarget || submitting}
          className="w-full h-10 bg-lime text-[hsl(0_0%_5%)] hover:bg-lime/90 font-semibold text-sm mt-1"
        >
          {submitting ? 'Creando...' : 'Crear y compartir'}
        </Button>
      </form>
    </div>
  )
}
