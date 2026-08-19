import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // CTA de acento lima. Fondo y texto salen de los tokens `--lime` /
        // `--lime-foreground`, nunca de una escala de Tailwind ni de
        // `hsl(var(--lime))` a pelo: solo el token se adapta al modo claro,
        // donde el lima es un oliva oscuro.
        //
        // El foreground fue casi-negro literal (`text-zinc-900`) mientras el
        // token era blanco en claro, porque blanco sobre ese oliva da 2,33:1 y
        // suspende WCAG AA. El #548 lo arregló en la raíz (ahora `0 0% 7%` en
        // los dos temas, ~7,6:1 en claro), así que la variante vuelve al token
        // como estaba previsto. `lib/lime-contrast.test.ts` falla en CI si el
        // token se vuelve a aclarar. Espejo de `limeSolid` en móvil.
        limeSolid: "bg-lime text-lime-foreground hover:bg-lime/90",
        // Acento lima secundario: filete + tinte, sin relleno. El lima marca
        // "activo/interactuable", así que esta es la forma por defecto de un
        // botón lima que no es el CTA. Espejo de `lime` en móvil.
        lime: "border border-lime/40 bg-lime/10 text-lime hover:bg-lime/20",
        // Acción destructiva secundaria (bloquear, abandonar): espejo de `lime`
        // en rojo. Para el botón destructivo principal existe `destructive`.
        danger:
          "border border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  ref?: React.Ref<HTMLButtonElement>
}

function Button({ className, variant, size, asChild = false, ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
}

export { Button, buttonVariants }
