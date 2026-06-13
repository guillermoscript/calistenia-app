import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import * as React from 'react'
import { ScrollView } from 'react-native'

/** Horizontal scrollable row of suggestion pill buttons. */
export type SuggestionsProps = {
  className?: string
  contentClassName?: string
  children: React.ReactNode
}

export function Suggestions({ className, contentClassName, children }: SuggestionsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={cn('w-full', className)}
      contentContainerClassName={cn('flex-row items-center gap-2 px-4', contentClassName)}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  )
}

export type SuggestionProps = {
  suggestion: string
  onPress?: (suggestion: string) => void
  className?: string
  disabled?: boolean
}

export function Suggestion({ suggestion, onPress, className, disabled }: SuggestionProps) {
  const handlePress = React.useCallback(() => {
    onPress?.(suggestion)
  }, [onPress, suggestion])

  return (
    <Button
      variant="outline"
      size="sm"
      onPress={handlePress}
      disabled={disabled}
      className={cn('rounded-full px-4', className)}>
      <Text className="text-sm">{suggestion}</Text>
    </Button>
  )
}
