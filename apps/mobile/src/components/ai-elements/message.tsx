import { Response } from '@/components/ai-elements/response'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import * as React from 'react'
import { View } from 'react-native'

/**
 * RN message bubble. `from` is published through context so MessageContent and
 * MessageResponse can style themselves without extra props drilling.
 *
 * - user → right-aligned secondary bubble
 * - assistant → left-aligned, full width, no bubble
 */
type MessageFrom = 'user' | 'assistant'

const MessageContext = React.createContext<MessageFrom>('assistant')
const useMessageFrom = () => React.useContext(MessageContext)

export type MessageProps = {
  from: MessageFrom
  className?: string
  children: React.ReactNode
}

export function Message({ from, className, children }: MessageProps) {
  return (
    <MessageContext.Provider value={from}>
      <View
        className={cn(
          'w-full max-w-[95%] flex-col gap-2',
          from === 'user' ? 'items-end self-end' : 'items-start self-start',
          className,
        )}>
        {children}
      </View>
    </MessageContext.Provider>
  )
}

export type MessageContentProps = {
  className?: string
  children: React.ReactNode
}

export function MessageContent({ className, children }: MessageContentProps) {
  const from = useMessageFrom()
  return (
    <View
      className={cn(
        'min-w-0 max-w-full flex-col gap-2 overflow-hidden',
        from === 'user' ? 'rounded-2xl rounded-br-sm bg-secondary px-4 py-3' : 'w-full',
        className,
      )}>
      {children}
    </View>
  )
}

export type MessageResponseProps = {
  children: string
}

export function MessageResponse({ children }: MessageResponseProps) {
  const from = useMessageFrom()
  if (from === 'user') {
    return <Text className="text-secondary-foreground">{children}</Text>
  }
  return <Response>{children}</Response>
}
