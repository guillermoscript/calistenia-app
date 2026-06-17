/**
 * InputGroup — react-native-reusables style composite input.
 *
 * A bordered flex-row container that lays out leading/trailing addons (icons,
 * buttons) alongside a borderless TextInput using real flexbox spacing — so an
 * icon is never absolutely positioned on top of the placeholder text.
 *
 *   <InputGroup>
 *     <InputGroupAddon><Search size={17} /></InputGroupAddon>
 *     <InputGroupInput placeholder="Search…" value={q} onChangeText={setQ} />
 *     <InputGroupAddon><Pressable onPress={clear}><X /></Pressable></InputGroupAddon>
 *   </InputGroup>
 */
import { cn } from '@/lib/utils'
import { Platform, TextInput, View } from 'react-native'

function InputGroup({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn(
        'border-input bg-background dark:bg-input/30 flex h-12 w-full flex-row items-center gap-2 rounded-xl border px-3 shadow-sm shadow-black/5',
        className,
      )}
      {...props}
    />
  )
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn('shrink-0 items-center justify-center', className)} {...props} />
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'text-foreground h-full flex-1 py-1 text-[15px] leading-5',
        props.editable === false && 'opacity-50',
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none md:text-sm',
          ),
          native: 'placeholder:text-muted-foreground/50',
        }),
        className,
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput }
