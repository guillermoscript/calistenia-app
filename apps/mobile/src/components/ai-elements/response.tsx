import { Text } from '@/components/ui/text'
import * as React from 'react'

/** Renders streamed assistant text. No markdown lib installed — plain Text. */
export type ResponseProps = {
  children: string
}

export const Response = React.memo(
  function Response({ children }: ResponseProps) {
    return (
      <Text className="text-base text-foreground" selectable>
        {children}
      </Text>
    )
  },
  (prev, next) => prev.children === next.children,
)
