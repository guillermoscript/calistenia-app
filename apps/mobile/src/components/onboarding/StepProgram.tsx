import { memo, useCallback } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import type { ProgramMeta } from '@calistenia/core/types'
import { matchUserToPrograms, type MatchUserInput, type MatchPenalty } from '@calistenia/core/lib/matchPrograms'

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: 'text-emerald-400',
  intermediate: 'text-amber-400',
  advanced: 'text-red-400',
}

interface Props {
  programs: ProgramMeta[]
  selectedProgramId: string | null
  selecting: boolean
  userId?: string
  user: MatchUserInput
  onSelectProgram: (programId: string) => void
  onBack: () => void
  onContinue: () => void
}

type ProgramTier = 'primary' | 'secondary' | 'other'

interface ProgramRow {
  program: ProgramMeta
  tier: ProgramTier
  penalties: MatchPenalty[]
}

interface RowProps {
  item: ProgramRow
  isSelected: boolean
  userId: string | undefined
  onSelect: (id: string) => void
}

const ProgramItem = memo(function ProgramItem({ item, isSelected, userId, onSelect }: RowProps) {
  const { t } = useTranslation()
  const { program, tier, penalties } = item
  const isOwn = program.created_by === userId

  const borderClass = isSelected
    ? 'border-lime bg-lime/5'
    : tier === 'primary'
      ? 'border-lime/30 bg-lime/[0.03]'
      : tier === 'secondary'
        ? 'border-sky-400/30 bg-sky-400/[0.03]'
        : program.is_featured
          ? 'border-amber-400/20 bg-amber-400/[0.03]'
          : 'border-transparent'

  return (
    <Pressable onPress={() => { haptics.selection(); onSelect(program.id) }} className="mb-3">
      <Card className={cn('border-2', borderClass)}>
        <CardContent className="p-4 flex-row items-center gap-3">
          <View className={cn(
            'w-10 h-10 rounded-lg items-center justify-center shrink-0',
            isSelected ? 'bg-lime' : 'bg-muted'
          )}>
            <Text className={cn(
              'font-bebas text-lg',
              isSelected ? 'text-lime-foreground' : 'text-muted-foreground'
            )}>
              {isSelected ? '✓' : (program.name[0]?.toUpperCase() ?? '?')}
            </Text>
          </View>

          <View className="flex-1 min-w-0 gap-0.5">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Text className={cn(
                'text-sm font-sans-medium',
                isSelected && 'text-lime'
              )}>
                {program.name}
              </Text>
              {tier === 'primary' ? (
                <View className="px-1.5 py-0.5 rounded border border-lime/50 bg-lime/10">
                  <Text className="text-[9px] text-lime">{t('onboarding.forYou')}</Text>
                </View>
              ) : null}
              {tier === 'secondary' ? (
                <View className="px-1.5 py-0.5 rounded border border-sky-400/50 bg-sky-400/10">
                  <Text className="text-[9px] text-sky-400">{t('onboarding.alsoForYou')}</Text>
                </View>
              ) : null}
              {program.is_featured && tier !== 'primary' && tier !== 'secondary' ? (
                <View className="px-1.5 py-0.5 rounded border border-amber-400/30">
                  <Text className="text-[9px] text-amber-400">{t('onboarding.recommended')}</Text>
                </View>
              ) : null}
              {program.is_official && !program.is_featured && tier !== 'primary' && tier !== 'secondary' ? (
                <View className="px-1.5 py-0.5 rounded border border-emerald-400/30">
                  <Text className="text-[9px] text-emerald-400">{t('onboarding.official')}</Text>
                </View>
              ) : null}
              {isOwn && !program.is_official ? (
                <View className="px-1.5 py-0.5 rounded border border-sky-500/30">
                  <Text className="text-[9px] text-sky-500">{t('onboarding.yours')}</Text>
                </View>
              ) : null}
              {!isOwn && !program.is_official && program.created_by_name ? (
                <Text className="text-[9px] text-muted-foreground">
                  {t('onboarding.by', { name: program.created_by_name })}
                </Text>
              ) : null}
            </View>

            {program.description ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                {program.description}
              </Text>
            ) : null}

            <View className="flex-row flex-wrap items-center gap-1.5 mt-1">
              <Text className="text-[10px] text-muted-foreground">
                {program.duration_weeks} {t('onboarding.weeks')}
              </Text>
              {program.difficulty ? (
                <Text className={cn('text-[10px]', DIFFICULTY_COLOR[program.difficulty] ?? '')}>
                  {t(`difficulty.${program.difficulty}`).toUpperCase()}
                </Text>
              ) : null}
              {penalties.map((p) => (
                <View key={p} className="px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10">
                  <Text className="text-[8px] text-amber-500">
                    {t(`programs.penalty.${p === 'high_frequency' ? 'highFrequency' : p === 'equipment_missing' ? 'equipmentMissing' : 'healthFlag'}`)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  )
})

export function StepProgram({
  programs, selectedProgramId, selecting, userId, user,
  onSelectProgram, onBack, onContinue,
}: Props) {
  const { t } = useTranslation()

  const { primary, secondary, penalties } = matchUserToPrograms(user, programs)

  const pinnedIds = new Set<string>([
    ...(primary ? [primary.id] : []),
    ...(secondary ? [secondary.id] : []),
  ])

  const featuredSort = (a: ProgramMeta, b: ProgramMeta) => {
    if (a.is_featured && !b.is_featured) return -1
    if (!a.is_featured && b.is_featured) return 1
    if (a.is_official && !b.is_official) return -1
    if (!a.is_official && b.is_official) return 1
    return a.name.localeCompare(b.name)
  }

  const rest = programs.filter((p) => !pinnedIds.has(p.id)).sort(featuredSort)

  const ordered: ProgramRow[] = [
    ...(primary ? [{ program: primary, tier: 'primary' as const, penalties: penalties.get(primary.id) ?? [] }] : []),
    ...(secondary ? [{ program: secondary, tier: 'secondary' as const, penalties: penalties.get(secondary.id) ?? [] }] : []),
    ...rest.map((p) => ({ program: p, tier: 'other' as const, penalties: penalties.get(p.id) ?? [] })),
  ]

  const renderItem = useCallback(({ item }: { item: ProgramRow }) => (
    <ProgramItem
      item={item}
      isSelected={selectedProgramId === item.program.id}
      userId={userId}
      onSelect={onSelectProgram}
    />
  ), [selectedProgramId, userId, onSelectProgram])

  const keyExtractor = useCallback((item: ProgramRow) => item.program.id, [])

  return (
    <View className="flex-1">
      <View className="items-center mb-4">
        <Text className="font-bebas text-3xl mb-1">{t('onboarding.chooseProgramTitle')}</Text>
        <Text className="text-sm text-muted-foreground text-center">{t('onboarding.chooseProgramDesc')}</Text>
      </View>

      <View className="flex-row items-center gap-2 px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/20 mb-4">
        <Text className="text-amber-400 text-sm">★</Text>
        <Text className="text-xs text-muted-foreground flex-1">
          {t('onboarding.recommendedHint').replace(/<\/?strong>/g, '')}
        </Text>
      </View>

      {user.primary_goal === 'resistencia' ? (
        <View className="px-3 py-2 rounded-lg bg-card border border-border mb-4">
          <Text className="text-xs text-muted-foreground">{t('onboarding.enduranceNotice')}</Text>
        </View>
      ) : null}

      <FlatList
        data={ordered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        className="max-h-96 mb-3"
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
      />

      <View className="flex-row gap-3 mt-3">
        <Button variant="outline" onPress={onBack} className="flex-1 h-11">
          <Text className="font-mono text-xs tracking-wide">{t('onboarding.back')}</Text>
        </Button>
        <Button
          onPress={onContinue}
          disabled={!selectedProgramId || selecting}
          className="flex-1 h-11 bg-lime active:bg-lime/90"
        >
          <Text className="font-bebas text-lg tracking-wide text-lime-foreground">
            {selecting ? t('onboarding.saving') : t('onboarding.continueBtn')}
          </Text>
        </Button>
      </View>
    </View>
  )
}
