import { Pressable, View } from 'react-native'
import { X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'

// Barra del modo selección (long-press en una fila lo activa): contador + borrar en lote.
export function SelectionBar({ count, onDelete, onCancel }: {
  count: number
  onDelete: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <View className="flex-row items-center gap-2 border-t border-border bg-background px-3 py-2">
      <Pressable
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        className="p-2"
      >
        <X size={18} color="hsl(0 0% 55%)" />
      </Pressable>
      <Text className="flex-1 font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
        {/* plural manual: Hermes puede no traer Intl.PluralRules y los sufijos _one/_other no resuelven */}
        {count === 1 ? t('common.selectedOne') : t('common.selectedMany', { n: count })}
      </Text>
      <Button size="sm" variant="destructive" onPress={onDelete}>
        <Text>{t('common.delete')}</Text>
      </Button>
    </View>
  )
}
