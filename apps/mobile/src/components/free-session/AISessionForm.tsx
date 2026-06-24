/** Formulario de configuración para el coach IA. Prellenado desde el perfil del
 *  usuario + nutrition_goals (igual que la web `SessionForm.tsx`). */
import { useState, useEffect } from 'react'
import { View, ScrollView } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/chip'
import { COLORS } from '@/lib/theme'
import { useAuthUser } from '@/lib/use-auth-user'
import { Sentry } from '@/lib/instrument'
import { pb } from '@calistenia/core/lib/pocketbase'

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

const TIMES = [15, 20, 30, 45, 60]

export interface UserContext {
  age?: number
  weight?: number
  height?: number
  sex?: string
  level: string
  goal: string
  equipment: string[]
  location: string
  availableTime: number
}

interface Props {
  onSubmit: (message: string, context: UserContext) => void
  isLoading?: boolean
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
      {children}
    </Text>
  )
}

export function AISessionForm({ onSubmit, isLoading }: Props) {
  const user = useAuthUser()

  const [age, setAge] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [sex, setSex] = useState('')
  const [level, setLevel] = useState('intermedio')
  const [goal, setGoal] = useState<Goal>('mixto')
  const [equipment, setEquipment] = useState<string[]>([])
  const [location, setLocation] = useState<Location>('parque')
  const [availableTime, setAvailableTime] = useState(30)

  // Prellenar desde perfil + nutrition_goals
  useEffect(() => {
    if (!user) return
    if (user.fitness_level) setLevel(user.fitness_level as string)

    let cancelled = false
    ;(async () => {
      try {
        const rec = await pb
          .collection('nutrition_goals')
          .getFirstListItem(pb.filter('user = {:uid}', { uid: user.id }))
        if (cancelled) return
        if (rec.age) setAge(String(rec.age))
        if (rec.weight) setWeight(String(rec.weight))
        if (rec.height) setHeight(String(rec.height))
        if (rec.sex) setSex(rec.sex as string)
      } catch (e) {
        Sentry.captureException(e, { tags: { feature: 'free_session', op: 'prefetch_nutrition_goals' } })
        /* sin nutrition_goals guardados */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  function toggleEquipment(id: string) {
    if (id === 'ninguno') {
      setEquipment((prev) => (prev.includes('ninguno') ? [] : ['ninguno']))
      return
    }
    setEquipment((prev) => {
      const without = prev.filter((e) => e !== 'ninguno')
      return without.includes(id) ? without.filter((e) => e !== id) : [...without, id]
    })
  }

  function handleSubmit() {
    const ctx: UserContext = {
      level,
      goal,
      equipment,
      location,
      availableTime,
      ...(age ? { age: Number(age) } : {}),
      ...(weight ? { weight: Number(weight) } : {}),
      ...(height ? { height: Number(height) } : {}),
      ...(sex ? { sex } : {}),
    }
    const msg = `Sesión de ${availableTime} min · ${goal} · ${location}`
    onSubmit(msg, ctx)
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-4 pb-8 gap-5"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/* Datos físicos */}
      <View>
        <FieldLabel>Datos físicos</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          <Input
            value={age}
            onChangeText={setAge}
            placeholder="Edad"
            placeholderTextColor={COLORS.placeholder}
            keyboardType="number-pad"
            className="h-11 flex-1 rounded-xl"
          />
          <Input
            value={weight}
            onChangeText={setWeight}
            placeholder="Peso (kg)"
            placeholderTextColor={COLORS.placeholder}
            keyboardType="number-pad"
            className="h-11 flex-1 rounded-xl"
          />
          <Input
            value={height}
            onChangeText={setHeight}
            placeholder="Altura (cm)"
            placeholderTextColor={COLORS.placeholder}
            keyboardType="number-pad"
            className="h-11 flex-1 rounded-xl"
          />
        </View>
        <View className="mt-2 flex-row gap-2">
          <Chip label="Masculino" active={sex === 'male'} onPress={() => setSex(sex === 'male' ? '' : 'male')} className="flex-1 items-center" />
          <Chip label="Femenino" active={sex === 'female'} onPress={() => setSex(sex === 'female' ? '' : 'female')} className="flex-1 items-center" />
        </View>
      </View>

      {/* Nivel */}
      <View>
        <FieldLabel>Nivel</FieldLabel>
        <View className="flex-row gap-1.5">
          {LEVELS.map((l) => (
            <Chip key={l.id} label={l.label} active={level === l.id} onPress={() => setLevel(l.id)} className="flex-1 items-center" />
          ))}
        </View>
      </View>

      {/* Objetivo */}
      <View>
        <FieldLabel>Objetivo</FieldLabel>
        <View className="flex-row flex-wrap gap-1.5">
          {GOALS.map((g) => (
            <Chip key={g.id} label={g.label} active={goal === g.id} onPress={() => setGoal(g.id)} />
          ))}
        </View>
      </View>

      {/* Equipamiento */}
      <View>
        <FieldLabel>Equipamiento</FieldLabel>
        <View className="flex-row flex-wrap gap-1.5">
          {EQUIPMENT_OPTIONS.map((eq) => (
            <Chip key={eq.id} label={eq.label} active={equipment.includes(eq.id)} onPress={() => toggleEquipment(eq.id)} />
          ))}
        </View>
      </View>

      {/* Ubicación */}
      <View>
        <FieldLabel>Ubicación</FieldLabel>
        <View className="flex-row gap-1.5">
          {LOCATIONS.map((loc) => (
            <Chip key={loc.id} label={loc.label} active={location === loc.id} onPress={() => setLocation(loc.id)} className="flex-1 items-center" />
          ))}
        </View>
      </View>

      {/* Tiempo */}
      <View>
        <FieldLabel>Tiempo disponible</FieldLabel>
        <View className="flex-row gap-1.5">
          {TIMES.map((t) => (
            <Chip key={t} label={`${t} min`} active={availableTime === t} onPress={() => setAvailableTime(t)} className="flex-1 items-center" />
          ))}
        </View>
      </View>

      {/* CTA */}
      <Button onPress={handleSubmit} disabled={isLoading} className="mt-1 w-full">
        <Text className="font-bebas text-lg tracking-wide">
          {isLoading ? 'Generando…' : 'Generar sesión'}
        </Text>
      </Button>
    </ScrollView>
  )
}
