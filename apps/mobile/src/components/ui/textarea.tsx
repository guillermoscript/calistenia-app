import { cn } from '@/lib/utils';
import { Platform, TextInput } from 'react-native';

function Textarea({
  className,
  multiline = true,
  numberOfLines = 4,
  placeholderClassName,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput> & { placeholderClassName?: string }) {
  return (
    <TextInput
      className={cn(
        'border-input bg-background text-foreground dark:bg-input/30 min-h-16 w-full rounded-md border px-3 py-2 text-base leading-5 shadow-sm shadow-black/5 sm:text-sm',
        props.editable === false &&
          cn(
            'opacity-50',
            Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
          ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground field-sizing-content outline-none transition-[color,box-shadow] md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
          ),
          native: 'placeholder:text-muted-foreground/50',
        }),
        className
      )}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical="top"
      {...props}
    />
  );
}

export { Textarea };
