import { Text } from '@/components/ui/text'
import { COLORS } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { ArrowDownIcon } from 'lucide-react-native'
import * as React from 'react'
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from 'react-native'

/**
 * Auto-pins to the bottom while the user is already scrolled there; surfaces a
 * floating "scroll to bottom" button when they scroll up.
 *
 *   <Conversation>
 *     <ConversationContent>{messages}</ConversationContent>
 *     <ConversationScrollButton />
 *   </Conversation>
 */
type ConversationContextValue = {
  isAtBottom: boolean
  scrollToBottom: () => void
}

const ConversationContext = React.createContext<ConversationContextValue | null>(null)

function useConversation() {
  const ctx = React.useContext(ConversationContext)
  if (!ctx) throw new Error('Conversation components must be used inside <Conversation>')
  return ctx
}

const BOTTOM_THRESHOLD = 24

export type ConversationProps = {
  className?: string
  children: React.ReactNode
}

export function Conversation({ className, children }: ConversationProps) {
  const scrollRef = React.useRef<ScrollView>(null)
  const atBottomRef = React.useRef(true)
  const [isAtBottom, setIsAtBottom] = React.useState(true)

  const scrollToBottom = React.useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true })
  }, [])

  const handleScroll = React.useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    const distanceFromBottom =
      contentSize.height - (layoutMeasurement.height + contentOffset.y)
    const atBottom = distanceFromBottom <= BOTTOM_THRESHOLD
    atBottomRef.current = atBottom
    setIsAtBottom((prev) => (prev === atBottom ? prev : atBottom))
  }, [])

  const handleContentSizeChange = React.useCallback(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollToEnd({ animated: true })
    }
  }, [])

  const childArray = React.Children.toArray(children)
  const overlay = childArray.filter(
    (c) => React.isValidElement(c) && c.type === ConversationScrollButton,
  )
  const content = childArray.filter(
    (c) => !(React.isValidElement(c) && c.type === ConversationScrollButton),
  )

  const value = React.useMemo<ConversationContextValue>(
    () => ({ isAtBottom, scrollToBottom }),
    [isAtBottom, scrollToBottom],
  )

  return (
    <ConversationContext.Provider value={value}>
      <View className={cn('relative flex-1', className)}>
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          onScroll={handleScroll}
          scrollEventThrottle={32}
          onContentSizeChange={handleContentSizeChange}
          keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
        {overlay}
      </View>
    </ConversationContext.Provider>
  )
}

export type ConversationContentProps = {
  className?: string
  children: React.ReactNode
}

export function ConversationContent({ className, children }: ConversationContentProps) {
  return <View className={cn('gap-4 p-4', className)}>{children}</View>
}

export type ConversationEmptyStateProps = {
  className?: string
  title?: string
  description?: string
  icon?: React.ReactNode
  children?: React.ReactNode
}

export function ConversationEmptyState({
  className,
  title = 'No hay mensajes',
  description,
  icon,
  children,
}: ConversationEmptyStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-3 p-8', className)}>
      {icon}
      {children ?? (
        <>
          <Text className="text-lg font-semibold">{title}</Text>
          {description ? (
            <Text className="text-center text-sm text-muted-foreground">{description}</Text>
          ) : null}
        </>
      )}
    </View>
  )
}

export type ConversationScrollButtonProps = {
  className?: string
}

export function ConversationScrollButton({ className }: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useConversation()
  if (isAtBottom) return null
  return (
    <View className="absolute bottom-4 left-0 right-0 items-center" pointerEvents="box-none">
      <Pressable
        onPress={scrollToBottom}
        hitSlop={8}
        className={cn(
          'rounded-full border border-border bg-background p-2 shadow-md shadow-black/10',
          className,
        )}>
        <ArrowDownIcon size={18} color={COLORS.mutedIcon} />
      </Pressable>
    </View>
  )
}
