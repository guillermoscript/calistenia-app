// Botón reutilizable "Repetir entrenamiento". Paridad con la web (WorkoutPage
// muestra "▶ REPETIR" cuando isDone). Se usa en la card de hoy del home y en la
// pantalla de celebración tras completar la sesión.
import { memo } from 'react'
import { RotateCcw } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { haptics as haptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'

const LIME = 'hsl(74 90% 45%)'
const LIME_FG = 'hsl(0 0% 4%)'

export interface RepeatTrainingButtonProps {
  onPress: () => void
  /** 'primary' = relleno lime (CTA principal); 'outline' = secundario. */
  tone?: 'primary' | 'outline'
  className?: string
}

/** Reusable repeat-session CTA. */
export const RepeatTrainingButton = memo(function RepeatTrainingButton({
  onPress,
  tone = 'outline',
  className,
}: RepeatTrainingButtonProps) {
  const { t } = useTranslation()
  const isPrimary = tone === 'primary'
  return (
    <Button
      variant={isPrimary ? 'default' : 'outline'}
      size="lg"
      className={cn('w-full flex-row items-center justify-center gap-2', isPrimary && 'bg-lime active:bg-lime/90', className)}
      onPress={() => { haptic.medium(); onPress() }}
      accessibilityLabel={t('workout.repeatBtn')}
    >
      <RotateCcw size={16} color={isPrimary ? LIME_FG : LIME} />
      <Text className={cn('font-bebas text-lg tracking-[2px]', isPrimary ? 'text-lime-foreground' : 'text-foreground')}>
        {t('workout.repeatBtn')}
      </Text>
    </Button>
  )
})
