import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, View } from 'react-native'
import type { DiscoverySourceId } from '@calistenia/core/lib/discovery-source'
import {
  DISCOVERY_SURVEY_DELAY_MS,
  DISCOVERY_SURVEY_RETRY_MS,
  DISCOVERY_SURVEY_SOURCES,
  USER_GOALS,
  canShowDiscoverySurvey,
  getRememberedDiscoverySource,
  markDiscoverySurvey,
  trackDiscoverySurveyCompleted,
  trackDiscoverySurveyDismissed,
  trackDiscoverySurveyViewed,
  type DiscoverySurveyStep,
  type UserGoalId,
} from '@calistenia/core/lib/discovery-survey'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'

/**
 * Misma encuesta que web. Las reglas de cuándo sale y qué se manda a
 * analítica viven en `core/lib/discovery-survey`; aquí solo se pinta.
 */
export default function DiscoverySurvey({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [rememberedSource, setRememberedSource] = useState<DiscoverySourceId | null>(null)
  const [source, setSource] = useState<DiscoverySourceId | null>(null)
  const [sourceConfirmed, setSourceConfirmed] = useState(false)
  const [goal, setGoal] = useState<UserGoalId | null>(null)
  const viewedSteps = useRef(new Set<DiscoverySurveyStep>())

  const step: DiscoverySurveyStep = rememberedSource || sourceConfirmed ? 'goal' : 'source'

  useEffect(() => {
    if (!userId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = () => {
      if (!canShowDiscoverySurvey(userId)) {
        timer = setTimeout(attempt, DISCOVERY_SURVEY_RETRY_MS)
        return
      }
      setRememberedSource(getRememberedDiscoverySource(userId))
      setVisible(true)
    }
    timer = setTimeout(attempt, DISCOVERY_SURVEY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [userId])

  useEffect(() => {
    if (!visible || viewedSteps.current.has(step)) return
    viewedSteps.current.add(step)
    trackDiscoverySurveyViewed('survey_mobile', step)
  }, [visible, step])

  if (!userId) return null

  const dismiss = () => {
    markDiscoverySurvey(userId, 'dismissed')
    trackDiscoverySurveyDismissed('survey_mobile', step, { discoverySource: sourceConfirmed ? source : null })
    setVisible(false)
  }

  const submit = () => {
    if (!goal) return
    markDiscoverySurvey(userId, 'answered')
    trackDiscoverySurveyCompleted('survey_mobile', {
      discoverySource: sourceConfirmed ? source : null,
      rememberedSource,
      goal,
    })
    setVisible(false)
  }

  const choose = (id: string) => {
    if (step === 'goal') {
      setGoal(id as UserGoalId)
      return
    }
    setSource(id as DiscoverySourceId)
    setSourceConfirmed(true)
  }

  const options = step === 'goal' ? USER_GOALS : DISCOVERY_SURVEY_SOURCES
  const selected = step === 'goal' ? goal : source

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-lg">
          <Text className="text-xl font-sans-bold text-foreground">{t('discoverySurvey.title')}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">{t('discoverySurvey.subtitle')}</Text>
          <Text className="mt-5 font-sans-medium text-foreground">
            {step === 'goal' ? t('discoverySurvey.goalQuestion') : t('onboarding.discoveryTitle')}
          </Text>
          <View className="mt-3 gap-2">
            {options.map((option) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === option.id }}
                onPress={() => choose(option.id)}
                className={`rounded-md border px-3 py-3 ${selected === option.id ? 'border-lime bg-lime/15' : 'border-border bg-card'}`}
              >
                <Text className="text-foreground">{t(option.labelKey)}</Text>
              </Pressable>
            ))}
          </View>
          <View className="mt-5 flex-row items-center justify-between gap-3">
            <Button variant="ghost" onPress={dismiss}><Text>{t('discoverySurvey.notNow')}</Text></Button>
            {step === 'goal' ? (
              <Button variant="limeSolid" disabled={!goal} onPress={submit}><Text>{t('discoverySurvey.submit')}</Text></Button>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  )
}
