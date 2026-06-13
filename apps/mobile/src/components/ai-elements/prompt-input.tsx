import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useColorScheme } from 'nativewind'
import {
  Loader2Icon,
  SendHorizontalIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react-native'
import * as React from 'react'
import { TextInput, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

/**
 * Composable prompt-input card:
 *
 *   <PromptInput>
 *     <PromptInputBody>
 *       <PromptInputTextarea value={text} onChangeText={setText} />
 *     </PromptInputBody>
 *     <PromptInputToolbar>
 *       <PromptInputTools>{...}</PromptInputTools>
 *       <PromptInputSubmit status={status} onPress={onSend} onStop={onStop} />
 *     </PromptInputToolbar>
 *   </PromptInput>
 */
export type PromptInputProps = {
  className?: string
  children: React.ReactNode
}

export function PromptInput({ className, children }: PromptInputProps) {
  return (
    <View
      className={cn(
        'gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm shadow-black/5',
        className,
      )}>
      {children}
    </View>
  )
}

export type PromptInputBodyProps = {
  className?: string
  children: React.ReactNode
}

export function PromptInputBody({ className, children }: PromptInputBodyProps) {
  return <View className={cn('w-full', className)}>{children}</View>
}

export type PromptInputTextareaProps = React.ComponentProps<typeof TextInput> & {
  onSubmit?: () => void
}

export function PromptInputTextarea({
  className,
  placeholder = 'Escribe un mensaje…',
  onSubmit,
  ...props
}: PromptInputTextareaProps) {
  return (
    <TextInput
      className={cn(
        'max-h-40 min-h-12 border-0 bg-transparent px-2 text-base text-foreground placeholder:text-muted-foreground/50',
        className,
      )}
      placeholder={placeholder}
      multiline
      submitBehavior="newline"
      onSubmitEditing={onSubmit}
      {...props}
    />
  )
}

export type PromptInputToolbarProps = {
  className?: string
  children: React.ReactNode
}

export function PromptInputToolbar({ className, children }: PromptInputToolbarProps) {
  return (
    <View className={cn('flex-row items-center justify-between gap-2', className)}>
      {children}
    </View>
  )
}

export type PromptInputToolsProps = {
  className?: string
  children?: React.ReactNode
}

export function PromptInputTools({ className, children }: PromptInputToolsProps) {
  return <View className={cn('flex-row items-center gap-1', className)}>{children}</View>
}

export type PromptInputButtonProps = React.ComponentProps<typeof Button>

export function PromptInputButton({ className, ...props }: PromptInputButtonProps) {
  return (
    <Button variant="ghost" size="icon" className={cn('rounded-full', className)} {...props} />
  )
}

function Spinner({ color }: { color: string }) {
  const rotation = useSharedValue(0)
  React.useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 800, easing: Easing.linear }),
      -1,
      false,
    )
    return () => cancelAnimation(rotation)
  }, [rotation])
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))
  return (
    <Animated.View style={style}>
      <Loader2Icon size={18} color={color} />
    </Animated.View>
  )
}

export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

export type PromptInputSubmitProps = {
  status?: ChatStatus
  onPress?: () => void
  onStop?: () => void
  disabled?: boolean
  className?: string
}

export function PromptInputSubmit({
  status,
  onPress,
  onStop,
  disabled,
  className,
}: PromptInputSubmitProps) {
  const { colorScheme } = useColorScheme()
  // Icon sits on a primary-colored button — use the primary-foreground token value.
  const iconColor = colorScheme === 'dark' ? '#171717' : '#fafafa'

  const isStreaming = status === 'streaming'
  const isSubmitted = status === 'submitted'
  const isError = status === 'error'

  const handlePress = React.useCallback(() => {
    if (isStreaming && onStop) {
      onStop()
      return
    }
    onPress?.()
  }, [isStreaming, onStop, onPress])

  let icon: React.ReactNode
  if (isSubmitted) {
    icon = <Spinner color={iconColor} />
  } else if (isStreaming) {
    icon = <SquareIcon size={16} color={iconColor} />
  } else if (isError) {
    icon = <XIcon size={18} color={iconColor} />
  } else {
    icon = <SendHorizontalIcon size={18} color={iconColor} />
  }

  const isDisabled = disabled || (isStreaming && !onStop) || isSubmitted

  return (
    <Button
      size="icon"
      onPress={handlePress}
      disabled={isDisabled}
      className={cn('rounded-full', className)}>
      {icon}
    </Button>
  )
}
