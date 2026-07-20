/**
 * Paso 1 del editor de programas (#223): información básica.
 * Port de ProgramEditorPage web :237-320 (sin isOfficial en v1 mobile:
 * publicar como oficial es flujo de editor/admin desde web).
 */
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import type { ProgramEditorState } from '@calistenia/core/hooks/useProgramEditor'

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const

interface StepInfoProps {
  info: ProgramEditorState['info']
  updateInfo: (info: Partial<ProgramEditorState['info']>) => void
  redistributeWeeks: () => void
}

export function StepInfo({ info, updateInfo, redistributeWeeks }: StepInfoProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent className="gap-4 p-5">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
          {t('programEditor.programInfo')}
        </Text>

        <View className="gap-1.5">
          <Label nativeID="pe-name">
            <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('programEditor.nameLabel')}
            </Text>
          </Label>
          <Input
            aria-labelledby="pe-name"
            placeholder={t('programEditor.namePlaceholder')}
            value={info.name}
            onChangeText={name => updateInfo({ name })}
          />
        </View>

        <View className="gap-1.5">
          <Label nativeID="pe-desc">
            <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('programEditor.descLabel')}
            </Text>
          </Label>
          <Textarea
            aria-labelledby="pe-desc"
            placeholder={t('programEditor.descPlaceholder')}
            value={info.description}
            onChangeText={description => updateInfo({ description })}
            numberOfLines={3}
          />
        </View>

        <View className="gap-1.5">
          <Label nativeID="pe-weeks">
            <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('programEditor.durationLabel')}
            </Text>
          </Label>
          <Input
            aria-labelledby="pe-weeks"
            keyboardType="number-pad"
            value={String(info.durationWeeks || '')}
            onChangeText={v => updateInfo({ durationWeeks: parseInt(v, 10) || 0 })}
            onBlur={redistributeWeeks}
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('programEditor.difficultyLabel')}
          </Text>
          <View className="flex-row gap-2">
            {DIFFICULTIES.map(d => {
              const active = info.difficulty === d
              return (
                <Pressable
                  key={d}
                  onPress={() => { haptics.light(); updateInfo({ difficulty: d }) }}
                  className={cn(
                    'flex-1 items-center rounded-lg border py-2.5 active:opacity-70',
                    active ? 'border-lime/50 bg-lime/10' : 'border-border bg-card',
                  )}
                >
                  <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                    {t(`difficulty.${d}`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </CardContent>
    </Card>
  )
}
