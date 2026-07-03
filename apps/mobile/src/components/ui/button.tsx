import { useRef } from 'react'
import { Animated, Platform, Pressable } from 'react-native'
import { TextClassContext } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-md shadow-none',
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    })
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary active:bg-primary/90 shadow-sm shadow-black/5',
          Platform.select({ web: 'hover:bg-primary/90' })
        ),
        destructive: cn(
          'bg-destructive active:bg-destructive/90 dark:bg-destructive/60 shadow-sm shadow-black/5',
          Platform.select({
            web: 'hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
          })
        ),
        outline: cn(
          'border-border bg-background active:bg-accent dark:bg-input/30 dark:border-input dark:active:bg-input/50 border shadow-sm shadow-black/5',
          Platform.select({
            web: 'hover:bg-accent dark:hover:bg-input/50',
          })
        ),
        secondary: cn(
          'bg-secondary active:bg-secondary/80 shadow-sm shadow-black/5',
          Platform.select({ web: 'hover:bg-secondary/80' })
        ),
        ghost: cn(
          'active:bg-accent dark:active:bg-accent/50',
          Platform.select({ web: 'hover:bg-accent dark:hover:bg-accent/50' })
        ),
        // Lime accent action. Uses the --lime token directly (no `dark:bg-input`
        // override like `outline`), so the tint survives twMerge and renders
        // visibly in the dark-first app — the reusable fix for "invisible" lime
        // outline buttons (e.g. the share trigger).
        lime: cn(
          'border border-lime/40 bg-lime/10 active:bg-lime/20',
          Platform.select({ web: 'hover:bg-lime/20' })
        ),
        // Solid lime CTA — filled accent for a primary, glanceable action
        // (e.g. the insight suggestedAction deep-link). Dark text for contrast.
        limeSolid: cn(
          'bg-lime active:bg-lime/90',
          Platform.select({ web: 'hover:bg-lime/90' })
        ),
        link: '',
      },
      size: {
        default: cn('h-10 px-4 py-2 sm:h-9', Platform.select({ web: 'has-[>svg]:px-3' })),
        sm: cn('h-9 gap-1.5 rounded-md px-3 sm:h-8', Platform.select({ web: 'has-[>svg]:px-2.5' })),
        lg: cn('h-11 rounded-md px-6 sm:h-10', Platform.select({ web: 'has-[>svg]:px-4' })),
        icon: 'h-10 w-10 sm:h-9 sm:w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

const buttonTextVariants = cva(
  cn(
    'text-foreground text-sm font-sans-medium',
    Platform.select({ web: 'pointer-events-none transition-colors' })
  ),
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        destructive: 'text-white',
        outline: cn(
          'group-active:text-accent-foreground',
          Platform.select({ web: 'group-hover:text-accent-foreground' })
        ),
        secondary: 'text-secondary-foreground',
        ghost: 'group-active:text-accent-foreground',
        lime: 'text-lime',
        limeSolid: 'text-black',
        link: cn(
          'text-primary group-active:underline',
          Platform.select({ web: 'underline-offset-4 hover:underline group-hover:underline' })
        ),
      },
      size: {
        default: '',
        sm: '',
        lg: '',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants>

function Button({ className, variant, size, onPressIn, onPressOut, disabled, ...props }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current
  const isLink = variant === 'link'

  const handlePressIn: React.ComponentProps<typeof Pressable>['onPressIn'] = (e) => {
    if (!disabled && !isLink && Platform.OS !== 'web') {
      Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 3 }).start()
      haptics.light()
    }
    onPressIn?.(e)
  }

  const handlePressOut: React.ComponentProps<typeof Pressable>['onPressOut'] = (e) => {
    if (!isLink && Platform.OS !== 'web') {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 3 }).start()
    }
    onPressOut?.(e)
  }

  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <AnimatedPressable
        className={cn(disabled && 'opacity-50', buttonVariants({ variant, size }), className)}
        role="button"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style={{ transform: [{ scale }] } as any}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        {...props}
      />
    </TextClassContext.Provider>
  )
}

export { Button, buttonTextVariants, buttonVariants }
export type { ButtonProps }
