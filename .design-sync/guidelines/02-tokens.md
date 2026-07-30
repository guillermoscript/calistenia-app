# Tokens

Todos los colores son variables CSS con **componentes HSL sueltos** (no un color
completo), así que se consumen como `hsl(var(--token))` y admiten alfa con
`hsl(var(--token) / 0.3)`. Las utilidades de Tailwind ya están generadas:
`bg-card`, `text-muted-foreground`, `border-border/50`, etc.

La fuente de verdad es `styles.css` y sus `@import` — léela antes de estilar.
Aquí van los valores para que puedas razonar sobre contraste.

## Color

| Token | Claro | Oscuro |
|---|---|---|
| `background` | `60 6% 97%` | `0 0% 3.9%` |
| `foreground` | `0 0% 8%` | `0 0% 98%` |
| `card` | `0 0% 100%` | `0 0% 7%` |
| `popover` | `0 0% 100%` | `0 0% 7%` |
| `primary` | `0 0% 12%` | `0 0% 98%` |
| `secondary` / `muted` / `accent` | `60 4% 93%` | `0 0% 14.9%` |
| `muted-foreground` | `0 0% 40%` | `0 0% 63.9%` |
| `destructive` | `0 84.2% 60.2%` | `0 62.8% 50%` |
| `border` / `input` | `60 4% 87%` | `0 0% 14.9%` |
| `ring` | `0 0% 12%` | `0 0% 83.1%` |
| **`lime`** | `74 90% 38%` | `74 90% 57%` |

Cada token trae su `-foreground` para el texto que va encima. **Los tokens ya
voltean solos bajo `.dark`** — no escribas variantes `dark:` para ellos; solo
hacen falta para valores crudos (`bg-zinc-900`).

El lima es más oscuro en modo claro (38%) que en oscuro (57%) para mantener el
contraste en ambos. `lime-foreground` es blanco en claro y casi-negro en oscuro.

También existen tokens de gráficas en hex, para librerías que no aceptan HSL
suelto: `--chart-axis`, `--chart-grid`, `--chart-tooltip-bg`,
`--chart-tooltip-border`, `--chart-tooltip-text`.

## Tipografía

Tres familias, servidas desde Google Fonts:

- `font-bebas` → **Bebas Neue**. Títulos y cifras, en mayúsculas condensadas.
  Suele ir con `tracking-wide`.
- `font-sans` → **DM Sans**. Cuerpo. Es la fuente por defecto del `body`.
- `font-mono` → **JetBrains Mono**. Kickers y etiquetas en MAYÚSCULAS, 9–11px,
  con `tracking-wider` o `tracking-widest`.

El cuerpo arranca en 14px con `line-height` 1.5.

## Forma y movimiento

- `--radius: 0.5rem`. `rounded-lg` es el radio base; `rounded-md` y `rounded-sm`
  se derivan restando 2px y 4px.
- Animaciones propias del sistema, listas para usar como clases:
  `animate-fade-in`, `animate-scale-in`, `animate-slide-up`,
  `animate-slide-down`, `animate-slide-in-right`, `animate-gentle-float`,
  `animate-dot-pulse`, `animate-workday-pulse`, `animate-accordion-down`,
  `animate-accordion-up`.
- Todas las animaciones y transiciones quedan neutralizadas bajo
  `prefers-reduced-motion: reduce` por una regla global. No la esquives.
- La selección de texto usa lima translúcido; las barras de scroll son de 4px en
  color `border`.
