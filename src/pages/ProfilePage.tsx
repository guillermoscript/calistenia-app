import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { cn } from '../lib/utils'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

const LEVELS = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
]

interface ProfilePageProps {
  user: any
}

export default function ProfilePage({ user }: ProfilePageProps) {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState(user?.display_name || user?.name || '')
  const [weight, setWeight] = useState<string>('')
  const [height, setHeight] = useState<string>('')
  const [level, setLevel] = useState('principiante')
  const [goal, setGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user?.id || loaded) return

    const load = async () => {
      const available = await isPocketBaseAvailable()
      if (available) {
        try {
          const rec = await pb.collection('users').getOne(user.id)
          setDisplayName((rec as any).display_name || (rec as any).name || '')
          setWeight((rec as any).weight ? String((rec as any).weight) : '')
          setHeight((rec as any).height ? String((rec as any).height) : '')
          setLevel((rec as any).level || 'principiante')
          setGoal((rec as any).goal || '')
        } catch (e) {
          console.warn('Failed to load profile:', e)
        }
      }
      setLoaded(true)
    }
    load()
  }, [user?.id, loaded])

  const bmi = useMemo(() => {
    const w = parseFloat(weight)
    const h = parseFloat(height)
    if (!w || !h || h <= 0) return null
    const meters = h / 100
    return (w / (meters * meters)).toFixed(1)
  }, [weight, height])

  const bmiCategory = useMemo(() => {
    if (!bmi) return null
    const v = parseFloat(bmi)
    if (v < 18.5) return { label: 'Bajo peso', color: 'text-amber-400' }
    if (v < 25) return { label: 'Normal', color: 'text-emerald-500' }
    if (v < 30) return { label: 'Sobrepeso', color: 'text-amber-400' }
    return { label: 'Obesidad', color: 'text-red-500' }
  }, [bmi])

  const handleSave = async () => {
    if (!user?.id) return
    setSaving(true)
    setSaved(false)

    try {
      const available = await isPocketBaseAvailable()
      if (available) {
        await pb.collection('users').update(user.id, {
          display_name: displayName,
          weight: weight ? parseFloat(weight) : null,
          height: height ? parseFloat(height) : null,
          level,
          goal,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (e) {
      console.warn('Failed to save profile:', e)
    }

    setSaving(false)
  }

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-2 uppercase">Cuenta</div>
      <div className="font-bebas text-[36px] md:text-[52px] leading-none mb-8">PERFIL</div>

      <div className="flex flex-col gap-5">
        {/* Basic info */}
        <Card id="tour-personal-info">
          <CardContent className="p-5 flex flex-col gap-4">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-1">Información Personal</div>

            <div>
              <Label htmlFor="profile-name" className="text-[11px] text-muted-foreground mb-1.5 block">Nombre</Label>
              <Input
                id="profile-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre"
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="profile-weight" className="text-[11px] text-muted-foreground mb-1.5 block">Peso (kg)</Label>
                <Input
                  id="profile-weight"
                  type="number"
                  step="0.1"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Ej: 75"
                  className="h-10"
                />
              </div>
              <div>
                <Label htmlFor="profile-height" className="text-[11px] text-muted-foreground mb-1.5 block">Altura (cm)</Label>
                <Input
                  id="profile-height"
                  type="number"
                  min="0"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="Ej: 175"
                  className="h-10"
                />
              </div>
            </div>

            {/* BMI */}
            {bmi && bmiCategory && (
              <div className="bg-muted/30 rounded-lg p-3 border border-border/60">
                <div className="flex items-baseline gap-2">
                  <span className="font-bebas text-3xl leading-none text-foreground">{bmi}</span>
                  <span className="text-[10px] text-muted-foreground tracking-wide uppercase">IMC</span>
                </div>
                <div className={cn('text-xs mt-0.5', bmiCategory.color)}>{bmiCategory.label}</div>
              </div>
            )}

            <div id="tour-level-selector">
              <Label htmlFor="profile-level" className="text-[11px] text-muted-foreground mb-1.5 block">Nivel</Label>
              <div className="flex gap-2">
                {LEVELS.map(l => (
                  <Button
                    key={l.value}
                    variant={level === l.value ? 'default' : 'outline'}
                    size="sm"
                    aria-pressed={level === l.value}
                    onClick={() => setLevel(l.value)}
                    className={level === l.value
                      ? 'h-8 px-4 text-[11px] bg-lime text-zinc-900 hover:bg-lime/90'
                      : 'h-8 px-4 text-[11px]'
                    }
                  >
                    {l.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="profile-goal" className="text-[11px] text-muted-foreground mb-1.5 block">Objetivo</Label>
              <textarea
                id="profile-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Ej: Lograr 10 muscle-ups seguidos, bajar grasa corporal..."
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Account info (read-only) */}
        <Card>
          <CardContent className="p-5">
            <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase mb-3">Cuenta</div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground">Email</span>
                <span className="text-sm text-foreground">{user?.email || '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground">Miembro desde</span>
                <span className="text-sm text-foreground">{user?.created?.split(' ')[0] || '—'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reminders link */}
        <Card
          className="cursor-pointer hover:border-lime-400/30 transition-colors"
          onClick={() => navigate('/reminders')}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔔</span>
              <div>
                <div className="text-sm font-medium">Recordatorios</div>
                <div className="text-[10px] text-muted-foreground">Comidas, ejercicio y pausas activas</div>
              </div>
            </div>
            <svg className="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </CardContent>
        </Card>

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-11 bg-lime text-zinc-900 hover:bg-lime/90 font-bebas text-lg tracking-wide"
        >
          {saving ? 'GUARDANDO...' : saved ? '¡GUARDADO!' : 'GUARDAR CAMBIOS'}
        </Button>
      </div>
    </div>
  )
}
