// Panel de acciones post-entreno (#347). Paridad con
// apps/web/src/components/PostWorkoutActions.tsx: vive dentro de la pantalla de
// celebración, debajo del resultado, y concentra el bucle de crecimiento —
// compartir (primaria), invitar, retos, progreso y repetir.
//
// La celebración entera es un Pressable que lleva al home, así que el panel se
// renderiza FUERA de ese Pressable (ver CelebrateScreen): si estuviera dentro,
// la primera pulsación en cualquier acción sacaría al usuario de la pantalla.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Pressable } from 'react-native'
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Copy, MessageCircle, RotateCcw, Share2, Swords, TrendingUp, UserPlus, X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { haptics as haptic } from '@/lib/haptics'
import { shareReferralInvite, shareReferralInviteByChannel, shareText, type ReferralShareChannel } from '@/lib/share'
import { LIME, MUTED } from '@/components/session/constants'
import { buildPostWorkoutActions, trackPostWorkoutAction, type PostWorkoutActionId } from '@calistenia/core/lib/post-workout-actions'
import { usePostWorkoutChallenge } from '@calistenia/core/hooks/usePostWorkoutChallenge'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import {
  markReferralPromptHandled,
  markReferralPromptViewed,
  shouldShowReferralPrompt,
} from '@calistenia/core/lib/referral-prompt'

const LIME_FG = 'hsl(0 0% 4%)'

export interface PostWorkoutActionsProps {
  workoutKey: string
  userId?: string | null
  /** Ids de los ejercicios del entreno, para saber a qué reto ha sumado. */
  exerciseIds: string[]
  referralCode: string | null
  userName: string
  totalSessions: number
  /** Captura de la tarjeta en curso: la comparte el host, que es quien la monta. */
  sharing: boolean
  onShare: () => void
  onRepeat?: () => void
  /** Cierra la sesión y navega. El panel nunca navega por su cuenta. */
  onNavigateAway: (path: string) => void
}

export function PostWorkoutActions({
  workoutKey,
  userId,
  exerciseIds,
  referralCode,
  userName,
  totalSessions,
  sharing,
  onShare,
  onRepeat,
  onNavigateAway,
}: PostWorkoutActionsProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  // Solo para esta finalización: no se persiste.
  const [dismissed, setDismissed] = useState(false)
  const [promptVisible, setPromptVisible] = useState(false)

  const { challenge } = usePostWorkoutChallenge(userId ?? null, exerciseIds)

  const actions = useMemo(() => buildPostWorkoutActions({
    canInvite: !!referralCode,
    canRepeat: !!onRepeat,
    affectedChallengeId: challenge?.id ?? null,
  }), [referralCode, onRepeat, challenge?.id])

  useEffect(() => {
    if (dismissed) return
    if (!shouldShowReferralPrompt({ userId, referralCode, totalSessions })) return

    markReferralPromptViewed(userId!)
    setPromptVisible(true)
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.referralPromptViewed, {
      surface: 'post_workout',
      source: 'workout_completion',
      workout_id: workoutKey,
      result: 'viewed',
    })
  }, [dismissed, userId, referralCode, totalSessions, workoutKey])

  const track = useCallback((action: PostWorkoutActionId) => {
    haptic.medium()
    trackPostWorkoutAction(action, { workoutKey, challengeId: action === 'challenge' ? challenge?.id : null })
  }, [workoutKey, challenge?.id])

  const handleInvite = useCallback(async () => {
    if (!referralCode) return
    track('invite')
    const { message, url } = shareReferralInvite(userName, referralCode)
    await shareText({ message, url })
    // `Share.share` siempre resuelve con sharedAction en Android, así que esto
    // cuenta como "hoja abierta", no como envío verificado.
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.inviteSent, {
      surface: 'post_workout',
      source: 'workout_completion',
      share_type: 'invite_link',
      result: 'sent',
      share_confirmed: false,
    })
  }, [referralCode, userName, track])

  const handlePromptInvite = useCallback(async (channel: ReferralShareChannel) => {
    if (!userId || !referralCode) return
    haptic.medium()

    try {
      const completed = await shareReferralInviteByChannel(userName, referralCode, channel)
      if (!completed) return

      markReferralPromptHandled(userId)
      setPromptVisible(false)
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.inviteSent, {
        surface: 'post_workout',
        source: 'workout_completion',
        workout_id: workoutKey,
        share_type: channel,
        result: channel === 'copy' ? 'copied' : 'sent',
        share_confirmed: channel === 'copy',
      })
    } catch {
      // La hoja o el enlace pueden fallar/cancelarse; el prompt queda disponible.
    }
  }, [userId, referralCode, userName, workoutKey])

  const handlePromptDismiss = useCallback(() => {
    if (!userId) return
    haptic.light()
    markReferralPromptHandled(userId)
    setPromptVisible(false)
  }, [userId])

  const handlePanelDismiss = useCallback(() => {
    haptic.light()
    if (promptVisible && userId) markReferralPromptHandled(userId)
    setDismissed(true)
  }, [promptVisible, userId])

  const handleChallenge = useCallback(() => {
    track('challenge')
    if (challenge) {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeViewed, {
        surface: 'post_workout',
        source: 'workout_completion',
        challenge_id: challenge.id,
        participant_count: challenge.participantCount,
        result: 'viewed',
      })
    }
    // No hay ruta de detalle de reto en móvil: `challenges` es pantalla única.
    onNavigateAway('/challenges')
  }, [challenge, onNavigateAway, track])

  const handleProgress = useCallback(() => {
    track('progress')
    onNavigateAway('/(tabs)/history')
  }, [onNavigateAway, track])

  const handleRepeat = useCallback(() => {
    track('repeat')
    onRepeat?.()
  }, [onRepeat, track])

  if (dismissed) return null

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.delay(620).duration(450)}
      className="mt-7 w-full max-w-[360px] self-center"
    >
      {promptVisible && (
        <ReferralPrompt
          onShare={handlePromptInvite}
          onDismiss={handlePromptDismiss}
        />
      )}

      <View className="mb-3 h-px bg-border" />

      <View className="mb-2.5 flex-row items-center justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
          {t('postWorkout.kicker')}
        </Text>
        <Pressable
          onPress={handlePanelDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('postWorkout.dismiss')}
          className="size-7 items-center justify-center"
        >
          <X size={14} color={MUTED} />
        </Pressable>
      </View>

      <View className="gap-1.5">
        {actions.map(action => {
          switch (action.id) {
            case 'share':
              return (
                <Button
                  key="share"
                  size="lg"
                  disabled={sharing}
                  className="w-full flex-row items-center justify-center gap-2 bg-lime active:bg-lime/90"
                  onPress={() => { track('share'); onShare() }}
                >
                  <Share2 size={16} color={LIME_FG} />
                  <Text className="font-bebas text-xl tracking-[2px] text-lime-foreground">
                    {sharing ? 'GENERANDO…' : t('postWorkout.share')}
                  </Text>
                </Button>
              )
            case 'invite':
              return (
                <ActionRow
                  key="invite"
                  icon={<UserPlus size={16} color={MUTED} />}
                  label={t('postWorkout.invite')}
                  hint={t('postWorkout.inviteHint')}
                  onPress={handleInvite}
                />
              )
            case 'challenge':
              return (
                <ActionRow
                  key="challenge"
                  icon={<Swords size={16} color={challenge ? LIME : MUTED} />}
                  label={challenge ? t('postWorkout.challengeActive', { title: challenge.title }) : t('postWorkout.challenge')}
                  hint={challenge ? t('postWorkout.challengeActiveHint') : t('postWorkout.challengeHint')}
                  accent={!!challenge}
                  onPress={handleChallenge}
                />
              )
            case 'progress':
              return (
                <ActionRow
                  key="progress"
                  icon={<TrendingUp size={16} color={MUTED} />}
                  label={t('postWorkout.progress')}
                  hint={t('postWorkout.progressHint')}
                  onPress={handleProgress}
                />
              )
            default:
              return (
                <ActionRow
                  key="repeat"
                  icon={<RotateCcw size={16} color={MUTED} />}
                  label={t('postWorkout.repeat')}
                  hint={t('postWorkout.repeatHint')}
                  onPress={handleRepeat}
                />
              )
          }
        })}
      </View>
    </Animated.View>
  )
}

function ReferralPrompt({
  onShare,
  onDismiss,
}: {
  onShare: (channel: ReferralShareChannel) => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()

  return (
    <View className="mb-4 border-l border-lime pl-3.5">
      <View className="mb-1.5 flex-row items-center justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-[3px] text-lime">
          {t('referral.prompt.kicker')}
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('referral.prompt.dismiss')}
          className="size-7 items-center justify-center"
        >
          <X size={14} color={MUTED} />
        </Pressable>
      </View>

      <Text className="mb-3 font-sans text-[13px] leading-[18px] text-foreground/80">
        {t('referral.prompt.question')}
      </Text>

      <View className="flex-row flex-wrap gap-2">
        <PromptButton
          icon={<Share2 size={14} color={LIME_FG} />}
          label={t('referral.prompt.native')}
          primary
          onPress={() => onShare('native')}
        />
        <PromptButton
          icon={<Copy size={14} color={MUTED} />}
          label={t('referral.prompt.copy')}
          onPress={() => onShare('copy')}
        />
        <PromptButton
          icon={<MessageCircle size={14} color={MUTED} />}
          label={t('referral.prompt.whatsapp')}
          onPress={() => onShare('whatsapp')}
        />
      </View>

      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        className="mt-3 self-start py-1"
      >
        <Text className="font-mono text-[10px] text-muted-foreground">
          {t('referral.prompt.dismiss')}
        </Text>
      </Pressable>
    </View>
  )
}

function PromptButton({ icon, label, onPress, primary }: {
  icon: React.ReactNode
  label: string
  onPress: () => void
  primary?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'min-h-10 flex-row items-center gap-1.5 rounded-md border px-3 py-2',
        primary ? 'border-lime bg-lime active:bg-lime/90' : 'border-border active:bg-muted/40',
      )}
    >
      {icon}
      <Text className={cn(
        'font-mono text-[10px] tracking-wide',
        primary ? 'text-lime-foreground' : 'text-foreground',
      )}>
        {label}
      </Text>
    </Pressable>
  )
}

function ActionRow({ icon, label, hint, onPress, accent }: {
  icon: React.ReactNode
  label: string
  hint: string
  onPress: () => void
  accent?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'w-full flex-row items-center gap-3 rounded-md border px-3.5 py-2.5',
        accent ? 'border-lime/40 bg-lime/5 active:bg-lime/10' : 'border-border active:bg-muted/40',
      )}
    >
      {icon}
      <View className="min-w-0 flex-1">
        <Text className={cn('font-sans text-[13px]', accent ? 'text-lime' : 'text-foreground')} numberOfLines={1}>
          {label}
        </Text>
        <Text className="font-mono text-[10px] tracking-wide text-muted-foreground" numberOfLines={1}>
          {hint}
        </Text>
      </View>
      <ChevronRight size={14} color={MUTED} />
    </Pressable>
  )
}
