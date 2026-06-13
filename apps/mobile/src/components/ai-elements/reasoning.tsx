import { Response } from '@/components/ai-elements/response'
import { Text } from '@/components/ui/text'
import { COLORS } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { BrainIcon, ChevronDownIcon } from 'lucide-react-native'
import * as React from 'react'
import { Pressable, View } from 'react-native'

/**
 * Collapsible reasoning trace block. Auto-opens while streaming, auto-closes
 * shortly after it ends (once). No Collapsible primitive — self-contained.
 */
type ReasoningContextValue = {
  isStreaming: boolean
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  duration?: number
}

const ReasoningContext = React.createContext<ReasoningContextValue | null>(null)

function useReasoning() {
  const ctx = React.useContext(ReasoningContext)
  if (!ctx) throw new Error('Reasoning components must be used inside <Reasoning>')
  return ctx
}

export type ReasoningProps = {
  isStreaming?: boolean
  defaultOpen?: boolean
  duration?: number
  className?: string
  children: React.ReactNode
}

export function Reasoning({
  isStreaming = false,
  defaultOpen = false,
  duration,
  className,
  children,
}: ReasoningProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen || isStreaming)
  const hasAutoClosed = React.useRef(false)

  React.useEffect(() => {
    if (isStreaming) {
      setIsOpen(true)
      hasAutoClosed.current = false
      return
    }
    if (!hasAutoClosed.current) {
      hasAutoClosed.current = true
      const t = setTimeout(() => setIsOpen(false), 1000)
      return () => clearTimeout(t)
    }
  }, [isStreaming])

  const value = React.useMemo<ReasoningContextValue>(
    () => ({ isStreaming, isOpen, setIsOpen, duration }),
    [isStreaming, isOpen, duration],
  )

  return (
    <ReasoningContext.Provider value={value}>
      <View className={cn('mb-2 w-full gap-2', className)}>{children}</View>
    </ReasoningContext.Provider>
  )
}

export type ReasoningTriggerProps = {
  className?: string
}

export function ReasoningTrigger({ className }: ReasoningTriggerProps) {
  const { isStreaming, isOpen, setIsOpen, duration } = useReasoning()

  let label: string
  if (isStreaming || duration === 0) {
    label = 'Pensando…'
  } else if (duration === undefined) {
    label = 'Razonamiento'
  } else {
    label = `Razonó durante ${duration} s`
  }

  return (
    <Pressable
      onPress={() => setIsOpen(!isOpen)}
      hitSlop={6}
      className={cn('flex-row items-center gap-2', className)}>
      <BrainIcon size={16} color={COLORS.mutedIcon} />
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <ChevronDownIcon
        size={16}
        color={COLORS.mutedIcon}
        style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
      />
    </Pressable>
  )
}

export type ReasoningContentProps = {
  className?: string
  children: string
}

export function ReasoningContent({ className, children }: ReasoningContentProps) {
  const { isOpen } = useReasoning()
  if (!isOpen) return null
  return (
    <View className={cn('border-l-2 border-border pl-3', className)}>
      <Response>{children}</Response>
    </View>
  )
}
