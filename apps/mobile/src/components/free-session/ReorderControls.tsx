/** Cluster de controles ↑ ↓ ✕ para filas reordenables (review manual + preview IA). */
import { View, Pressable } from 'react-native'
import { ChevronUp, ChevronDown, Trash2, X } from 'lucide-react-native'
import { cn } from '@/lib/utils'
import { COLORS } from '@/lib/theme'

interface ReorderControlsProps {
  /** Posición en la lista (deshabilita ↑ en 0 y ↓ en el último). */
  index: number
  count: number
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  size?: number
  /** Icono de borrado: papelera (manual) o cruz (preview IA). */
  removeIcon?: 'trash' | 'x'
}

export function ReorderControls({
  index,
  count,
  onMoveUp,
  onMoveDown,
  onRemove,
  size = 16,
  removeIcon = 'trash',
}: ReorderControlsProps) {
  const isFirst = index === 0
  const isLast = index === count - 1
  const RemoveIcon = removeIcon === 'trash' ? Trash2 : X

  return (
    <View className="flex-row items-center gap-0.5">
      <Pressable
        onPress={onMoveUp}
        disabled={isFirst}
        className={cn('rounded-lg p-1.5 active:bg-muted/60', isFirst ? 'opacity-30' : '')}
      >
        <ChevronUp size={size} color={COLORS.mutedIcon} />
      </Pressable>
      <Pressable
        onPress={onMoveDown}
        disabled={isLast}
        className={cn('rounded-lg p-1.5 active:bg-muted/60', isLast ? 'opacity-30' : '')}
      >
        <ChevronDown size={size} color={COLORS.mutedIcon} />
      </Pressable>
      <Pressable onPress={onRemove} className="rounded-lg p-1.5 active:bg-destructive/10">
        <RemoveIcon size={size} color={COLORS.mutedIcon} />
      </Pressable>
    </View>
  )
}
