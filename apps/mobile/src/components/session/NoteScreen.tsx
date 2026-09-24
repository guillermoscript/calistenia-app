import { useState } from 'react'
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { haptics as haptic } from '@/lib/haptics'

interface NoteScreenProps {
  workoutTitle: string
  totalSetsLogged: number
  durationMin: number
  onSave: (note: string) => void
}

/** Nota de cierre de la sesión, entre el último set y la celebración. */
export default function NoteScreen({ workoutTitle, totalSetsLogged, durationMin, onSave }: NoteScreenProps) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const reduced = useReducedMotion()
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow items-center justify-center gap-6 px-5 py-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Animated.Text
        entering={reduced ? undefined : FadeInDown.duration(450)}
        className="text-center font-bebas text-5xl leading-none tracking-[2px] text-emerald-500"
      >
        {t('session.lastSetTitle')}
      </Animated.Text>
      <Text className="font-mono text-[11px] tracking-[2px] text-muted-foreground">
        {workoutTitle.trim() ? `${workoutTitle.toUpperCase()} · ` : ''}{totalSetsLogged} {t('common.sets').toUpperCase()} · {durationMin} {t('common.minutes').toUpperCase()}
      </Text>

      <Animated.View entering={reduced ? undefined : FadeInDown.delay(140).duration(450)} className="w-full max-w-[420px]">
        <Card className="gap-4 py-5">
          <CardHeader className="gap-1.5">
            <Text className="font-mono text-[10px] uppercase tracking-[2px] text-lime">{t('session.noteCardTitle')}</Text>
            <Text className="text-[13px] text-muted-foreground">{t('session.noteCardSubtitle')}</Text>
          </CardHeader>
          <CardContent>
            <Textarea
              value={note}
              onChangeText={setNote}
              accessibilityLabel={t('session.noteCardTitle')}
              placeholder={t('session.noteExampleMobile')}
              numberOfLines={3}
              className="min-h-[84px] text-[13px] leading-[18px]"
            />
          </CardContent>
        </Card>
      </Animated.View>

      {/* Actions live below the card so they never overlap its border */}
      <Animated.View entering={reduced ? undefined : FadeInDown.delay(220).duration(450)} className="w-full max-w-[420px] flex-row items-stretch gap-2.5">
        <Button className="h-12 flex-1 bg-lime active:bg-lime/90" onPress={() => { haptic.medium(); onSave(note.trim()) }}>
          <Text className="font-bebas text-lg tracking-wide text-lime-foreground">{t('common.save').toUpperCase()}</Text>
        </Button>
        <Button variant="outline" className="h-12 px-5" onPress={() => onSave('')}>
          <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">{t('workout.skip').toUpperCase()}</Text>
        </Button>
      </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
