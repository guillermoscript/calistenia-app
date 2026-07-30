# Cómo construir con este design system

Los componentes son los primitivos reales de la app web de Calistenia (shadcn/ui
sobre Radix, Tailwind v4, React 19). Están en `window.Calistenia`.

## Envoltorios y contexto

**No hay provider global.** La mayoría de los componentes renderizan sueltos.
Tres excepciones, y sin su envoltorio no se ven:

- `Tooltip` → necesita `TooltipProvider` en un ancestro.
- `Sidebar` → necesita `SidebarProvider` envolviendo la página, y el contenido
  principal va en `SidebarInset` como hermano de `Sidebar`.
- `Carousel` → los `CarouselItem` van dentro de `CarouselContent`.

**Modo oscuro**: pon `class="dark"` en un ancestro (normalmente `<html>`). Los
tokens voltean solos; no escribas variantes `dark:` para ellos. El sistema es
oscuro primero — diseña ahí y comprueba el claro después.

```jsx
<div className="dark">
  <div className="min-h-screen bg-background p-6 text-foreground">
    {/* tu pantalla */}
  </div>
</div>
```

## El idioma de estilado: clases de Tailwind sobre tokens semánticos

Se estila con `className` y **utilidades de Tailwind apuntando a tokens
semánticos**, nunca con colores crudos ni hex. Las familias reales:

| Familia | Clases |
|---|---|
| Superficie | `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-secondary`, `bg-accent` |
| Texto | `text-foreground`, `text-muted-foreground`, `text-card-foreground`, `text-primary`, `text-destructive` |
| Acento | `bg-lime`, `text-lime`, `text-lime-foreground`, `border-lime/40`, `bg-lime/10` |
| Filete | `border-border`, `border-input`, `border-border/50` |
| Foco | `ring-ring`, `ring-offset-background`, `focus-visible:ring-2` |
| Barra lateral | `bg-sidebar`, `text-sidebar-foreground`, `border-sidebar-border` |
| Tipografía | `font-bebas`, `font-sans`, `font-mono` |
| Radio | `rounded-lg` (base), `rounded-md`, `rounded-sm`, `rounded-full` |
| Movimiento | `animate-fade-in`, `animate-scale-in`, `animate-slide-up`, `animate-slide-down`, `animate-slide-in-right`, `animate-gentle-float`, `animate-dot-pulse`, `animate-workday-pulse` |

Todos los tokens de color admiten alfa: `bg-card/50`, `border-lime/40`,
`text-muted-foreground/70`.

### Los valores arbitrarios NO funcionan

El CSS de este sistema está **pregenerado**: se compiló antes, escaneando el
código de la app más una lista del vocabulario nombrado. Tailwind solo emite una
utilidad de valor arbitrario si la ve escrita en el código que escanea, y tu
código no estaba ahí. Por eso `grid-cols-[1fr_auto]`, `text-[150px]`,
`w-[1080px]` o `leading-[0.92]` **no existen y no hacen nada**. No fallan de
forma visible: el elemento simplemente sale sin ese estilo.

Dos salidas, en este orden:

1. **Usa la escala nombrada** siempre que exista: `text-5xl` en vez de
   `text-[48px]`, `w-64` en vez de `w-[256px]`, `leading-none`/`leading-tight`,
   `flex items-start justify-between` en vez de `grid-cols-[1fr_auto]`.
2. **Para números puntuales que no están en la escala** — tamaños de lienzo de un
   flier, un titular de 150 px, una altura exacta — usa **`style` inline**. Es
   inmune al purgado y siempre funciona:

```jsx
<div style={{ width: 1080, height: 1080 }}>
  <h1 className="font-bebas font-normal" style={{ fontSize: 150, lineHeight: 0.92 }}>…</h1>
</div>
```

Única excepción comprobada: `text-[10px]`, `text-[11px]` y `text-[9px]` sí
existen porque la app los usa para los kickers en mono.

## Las cuatro reglas de marca que más se incumplen

1. **El lima NO es el color de los botones.** `<Button>` por defecto es
   casi-negro sobre claro y casi-blanco sobre oscuro. El lima marca
   **completado / activo / interactuado**: `Badge` de completado, bordes activos
   `border-lime/40`, pulsación `bg-lime/10`.
2. **Filetes de 1px, no sombras.** Estructura con `border-border` y jerarquía
   tipográfica. Nada de `shadow-lg` en tarjetas, nada de tarjetas anidadas, nada
   de degradados ni glassmorphism.
3. **El idioma de cabecera es kicker + título**: una etiqueta en
   `font-mono text-[10px] uppercase tracking-widest text-muted-foreground`
   encima de un título en `font-bebas font-normal text-3xl tracking-wide`. Las cifras
   grandes van en Bebas.
4. **Bebas Neue tiene un solo peso: acompáñala SIEMPRE de `font-normal`.** Si la
   aplicas sobre algo que ya trae peso — `CardTitle` lleva `font-semibold` de
   base — el navegador le mete **bold sintético** y el titular sale emborronado.
   Vale igual para `font-mono`. Nunca combines `font-bold`/`font-semibold` con
   `font-bebas` o `font-mono`.

## Activos de marca

El logotipo es la **marca gráfica** (atleta en front lever, lima) más
**«CALISTENIA» en Bebas mayúsculas**. La marca gráfica está incrustada en CSS:

- `--brand-mark` — la imagen. Proporción obligatoria `--brand-mark-aspect`
  (`428 / 512`). No la recolorees.
- `--brand-grid` y `--brand-glow` — la trama de hairlines y el glow lima de la
  **superficie de marketing**.

Ojo con esto: `--brand-glow` es un degradado, y la regla 2 de arriba prohíbe
degradados. **La prohibición es para la UI de producto**; las piezas de
marketing y social sí llevan glow y trama — así es la imagen social oficial de
la marca. En marketing sigue prohibido el *texto* con degradado. Ver
`guidelines/04-social-y-fliers.md` para lienzos y recetas de composición.

## Dónde está la verdad

- `styles.css` y sus `@import` — los tokens y el CSS real de los componentes.
  Léelo antes de estilar.
- `guidelines/` — marca y estética (`01`), tabla completa de tokens (`02`),
  reglas de la app nativa y equivalencias para mockups móviles (`03`), y
  lienzos y recetas para social y fliers (`04`).
- `components/<grupo>/<Nombre>/<Nombre>.prompt.md` — para qué sirve cada
  componente, su composición canónica y sus props.

## Ejemplo idiomático

```jsx
const { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Button, Progress } = window.Calistenia

function ResumenDeHoy() {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="font-mono text-[10px] uppercase tracking-widest">
            Entreno de hoy
          </CardDescription>
          <CardTitle className="font-bebas font-normal text-3xl tracking-wide">Empuje · Día 2</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">3 de 5 ejercicios</span>
            <Badge className="bg-lime text-lime-foreground">En curso</Badge>
          </div>
          <Progress value={60} />
          <Button className="w-full">Reanudar sesión</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {[['Racha', '12'], ['Esta semana', '4']].map(([etiqueta, valor]) => (
          <div key={etiqueta} className="rounded-lg border border-border p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {etiqueta}
            </p>
            <p className="font-bebas font-normal text-4xl tracking-wide">{valor}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

Nota sobre el texto: el copy va en **español**, con voz de cuaderno de
entrenamiento — segura, seca, sin relleno.
