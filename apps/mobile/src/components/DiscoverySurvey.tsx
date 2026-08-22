import { useEffect, useState } from 'react'
import { Modal, Pressable, View } from 'react-native'
import { op } from '@calistenia/core/lib/analytics'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { syncStorage } from '@/lib/storage'

const SOURCES = ['ChatGPT o IA', 'Google', 'Instagram, TikTok o YouTube', 'Recomendación de alguien', 'Otro'] as const
const GOALS = ['Una rutina de calistenia', 'Aprender un ejercicio', 'Seguir mi progreso', 'Entrenar en casa', 'Otro'] as const

const storageKey = (userId: string) => `calistenia_discovery_survey_v1_${userId}`

/** Misma encuesta breve que web. El texto libre se evita para no enviar PII a analytics. */
export default function DiscoverySurvey({ userId }: { userId: string | null }) {
  const [visible, setVisible] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [goal, setGoal] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || syncStorage.getItem(storageKey(userId))) return
    const timeout = setTimeout(() => {
      setVisible(true)
      op.track('discovery_survey_viewed', { platform: 'mobile' })
    }, 4_000)
    return () => clearTimeout(timeout)
  }, [userId])

  const dismiss = () => {
    if (userId) syncStorage.setItem(storageKey(userId), 'dismissed')
    setVisible(false)
    op.track('discovery_survey_dismissed', { platform: 'mobile', step: source ? 'goal' : 'source' })
  }

  const submit = () => {
    if (!userId || !source || !goal) return
    syncStorage.setItem(storageKey(userId), 'answered')
    setVisible(false)
    op.track('discovery_survey_completed', { platform: 'mobile', discovery_source: source, user_goal: goal })
  }

  if (!userId) return null
  const options = source ? GOALS : SOURCES
  const selected = source ? goal : source

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-lg">
          <Text className="text-xl font-sans-bold text-foreground">Ayúdanos a mejorar Calistenia</Text>
          <Text className="mt-1 text-sm text-muted-foreground">Es opcional y toma menos de un minuto.</Text>
          <Text className="mt-5 font-sans-medium text-foreground">
            {source ? '¿Qué estabas buscando cuando llegaste?' : '¿Cómo conociste Calistenia?'}
          </Text>
          <View className="mt-3 gap-2">
            {options.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                onPress={() => source ? setGoal(option) : setSource(option)}
                className={`rounded-md border px-3 py-3 ${selected === option ? 'border-lime bg-lime/15' : 'border-border bg-card'}`}
              >
                <Text className="text-foreground">{option}</Text>
              </Pressable>
            ))}
          </View>
          <View className="mt-5 flex-row items-center justify-between gap-3">
            <Button variant="ghost" onPress={dismiss}><Text>Ahora no</Text></Button>
            {source ? <Button variant="limeSolid" disabled={!goal} onPress={submit}><Text>Enviar</Text></Button> : null}
          </View>
        </View>
      </View>
    </Modal>
  )
}
