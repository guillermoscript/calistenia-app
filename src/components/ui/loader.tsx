import { cn } from '@/lib/utils'

interface LoaderProps {
  /** Text label shown below the spinner */
  label?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Use full-screen centered layout */
  fullScreen?: boolean
  className?: string
}

const sizeMap = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-3',
}

export function Loader({ label, size = 'md', fullScreen = false, className }: LoaderProps) {
  const content = (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className={cn(
          'animate-spin rounded-full border-primary/30 border-t-primary',
          sizeMap[size],
        )}
      />
      {label && (
        <span className="text-sm text-muted-foreground font-mono tracking-wide animate-pulse">
          {label}
        </span>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {content}
      </div>
    )
  }

  return content
}
