import { useState, useEffect } from 'react'
import { useAuthState } from '../../contexts/AuthContext'
import { pb } from '../../lib/pocketbase'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { NutritionGoal, Sex } from '../../types'

type Goal = 'fuerza' | 'resistencia' | 'movilidad' | 'mixto' | 'yoga' | 'circuito'
type Location = 'casa' | 'parque' | 'gimnasio'

const GOALS: { id: Goal; label: string }[] = [
  { id: 'fuerza', label: 'Fuerza' },
  { id: 'resistencia', label: 'Resistencia' },
  { id: 'movilidad', label: 'Movilidad' },
  { id: 'yoga', label: 'Yoga' },
  { id: 'circuito', label: 'Circuito' },
  { id: 'mixto', label: 'Mixto' },
]

const EQUIPMENT_OPTIONS = [
  { id: 'barra_dominadas', label: 'Barra' },
  { id: 'paralelas', label: 'Paralelas' },
  { id: 'anillas', label: 'Anillas' },
  { id: 'banda_elastica', label: 'Bandas' },
  { id: 'banco', label: 'Banco' },
  { id: 'pared', label: 'Pared' },
  { id: 'cuerda', label: 'Cuerda' },
  { id: 'ninguno', label: 'Ninguno' },
]

const LOCATIONS: { id: Location; label: string }[] = [
  { id: 'casa', label: 'Casa' },
  { id: 'parque', label: 'Parque' },
  { id: 'gimnasio', label: 'Gimnasio' },
]

const LEVELS = [
  { id: 'principiante', label: 'Principiante' },
  { id: 'intermedio', label: 'Intermedio' },
  { id: 'avanzado', label: 'Avanzado' },
]

interface SessionFormProps {
  onSubmit: (message: string) => void
  isLoading?: boolean
}

export default function SessionForm({ onSubmit, isLoading }: SessionFormProps) {
  const { user } = useAuthState()

  const [age, setAge] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [sex, setSex] = useState<Sex | ''>('')
  const [level, setLevel] = useState('intermedio')
  const [goal, setGoal] = useState<Goal>('mixto')
  const [equipment, setEquipment] = useState<string[]>([])
  const [location, setLocation] = useState<Location>('parque')
  const [availableTime, setAvailableTime] = useState(30)

  // Pre-fill from user profile + nutrition_goals
  useEffect(() => {
    if (!user) return
    if (user.fitness_level) setLevel(user.fitness_level)

    const loadGoals = async () => {
      try {
        const rec = await pb.collection('nutrition_goals').getFirstListItem(
          pb.filter('user = {:uid}', { uid: user.id })
        )
        if (rec.age) setAge(String(rec.age))
        if (rec.weight) setWeight(String(rec.weight))
        if (rec.height) setHeight(String(rec.height))
        if (rec.sex) setSex(rec.sex as Sex)
      } catch { /* no goals saved yet */ }
    }
    loadGoals()
  }, [user])

  const toggleEquipment = (id: string) => {
    if (id === 'ninguno') {
      setEquipment(prev => prev.includes('ninguno') ? [] : ['ninguno'])
      return
    }
    setEquipment(prev => {
      const without = prev.filter(e => e !== 'ninguno')
      return without.includes(id) ? without.filter(e => e !== id) : [...without, id]
    })
  }

  const handleSubmit = () => {
    const parts: string[] = []
    parts.push(`Generar una sesión de calistenia de ${availableTime} minutos.`)
    parts.push(`Objetivo: ${goal}.`)
    if (age) parts.push(`Edad: ${age} años.`)
    if (weight) parts.push(`Peso: ${weight} kg.`)
    if (height) parts.push(`Altura: ${height} cm.`)
    if (sex) parts.push(`Sexo: ${sex}.`)
    parts.push(`Nivel: ${level}.`)
    parts.push(`Ubicación: ${location}.`)
    if (equipment.length > 0) {
      parts.push(`Equipamiento disponible: ${equipment.join(', ')}.`)
    } else {
      parts.push('Sin equipamiento.')
    }
    onSubmit(parts.join(' '))
  }

  return (
    <div className="space-y-5">
      {/* Physical data */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-[2px] uppercase mb-2 block">Datos físicos</label>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Edad" value={age} onChange={e => setAge(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-lime/50" />
          <input type="number" placeholder="Peso (kg)" value={weight} onChange={e => setWeight(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-lime/50" />
          <input type="number" placeholder="Altura (cm)" value={height} onChange={e => setHeight(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-lime/50" />
          <select value={sex} onChange={e => setSex(e.target.value as Sex)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:border-lime/50">
            <option value="">Sexo</option>
            <option value="male">Masculino</option>
            <option value="female">Femenino</option>
          </select>
        </div>
      </div>

      {/* Level */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-[2px] uppercase mb-2 block">Nivel</label>
        <div className="flex gap-1.5">
          {LEVELS.map(l => (
            <button key={l.id} onClick={() => setLevel(l.id)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                level === l.id ? 'border-lime/50 bg-lime/10 text-lime' : 'border-border text-muted-foreground hover:text-foreground'
              )}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Goal */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-[2px] uppercase mb-2 block">Objetivo</label>
        <div className="grid grid-cols-2 gap-1.5">
          {GOALS.map(g => (
            <button key={g.id} onClick={() => setGoal(g.id)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                goal === g.id ? 'border-lime/50 bg-lime/10 text-lime' : 'border-border text-muted-foreground hover:text-foreground'
              )}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Equipment */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-[2px] uppercase mb-2 block">Equipamiento</label>
        <div className="flex flex-wrap gap-1.5">
          {EQUIPMENT_OPTIONS.map(eq => (
            <button key={eq.id} onClick={() => toggleEquipment(eq.id)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                equipment.includes(eq.id) ? 'border-lime/50 bg-lime/10 text-lime' : 'border-border text-muted-foreground hover:text-foreground'
              )}>
              {eq.label}
            </button>
          ))}
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-[2px] uppercase mb-2 block">Ubicación</label>
        <div className="flex gap-1.5">
          {LOCATIONS.map(loc => (
            <button key={loc.id} onClick={() => setLocation(loc.id)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                location === loc.id ? 'border-lime/50 bg-lime/10 text-lime' : 'border-border text-muted-foreground hover:text-foreground'
              )}>
              {loc.label}
            </button>
          ))}
        </div>
      </div>

      {/* Available time */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-[2px] uppercase mb-2 block">
          Tiempo disponible: <span className="text-foreground font-medium">{availableTime} min</span>
        </label>
        <input type="range" min={15} max={60} step={5} value={availableTime}
          onChange={e => setAvailableTime(Number(e.target.value))}
          className="w-full accent-[hsl(var(--lime))]" />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>15 min</span>
          <span>60 min</span>
        </div>
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={isLoading}
        className="w-full font-bebas text-lg tracking-wide bg-[hsl(var(--lime))] text-[hsl(var(--lime-foreground))] hover:bg-[hsl(var(--lime))]/90"
      >
        {isLoading ? 'Generando...' : 'Generar sesión'}
      </Button>
    </div>
  )
}
