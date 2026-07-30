---
category: Surfaces
---

La superficie base del sistema: una unidad de contenido sobre el fondo. En esta app estructura casi todo — resumen de sesión, tarjeta de ejercicio, bloque de estadística. Composición habitual: `CardHeader` (con `CardTitle` y opcionalmente `CardDescription`) + `CardContent`; `CardFooter` solo cuando hay acciones.

## Composición

```jsx
<Card>
  <CardHeader>
    <CardTitle>Dominadas</CardTitle>
    <CardDescription>4 series · 8 repeticiones</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">Último registro: 4×7 hace 3 días</p>
  </CardContent>
  <CardFooter>
    <Button size="sm">Registrar serie</Button>
  </CardFooter>
</Card>
```

## Piezas

- `CardHeader` — Zona superior. Apila en columna (`flex flex-col`). Contiene `CardTitle` y, si hace falta, `CardDescription`.
- `CardTitle` — Título de la tarjeta. Trae `font-semibold` de base, así que para títulos de impacto usa `className="font-bebas font-normal text-2xl tracking-wide"` — **`font-normal` es obligatorio**: Bebas tiene un solo peso y sin él el navegador le aplica bold sintético.
- `CardDescription` — Subtítulo en tono atenuado, bajo el título.
- `CardAction` — Envoltorio sin estilos propios (es un `div` pelado). **No alinea ni posiciona nada por sí mismo.** Para poner una acción arriba a la derecha, maqueta tú la cabecera: `<CardHeader className="flex-row items-start justify-between gap-2 space-y-0">` y mete la acción como segundo hijo. Nada de `grid-cols-[1fr_auto]`: los valores arbitrarios no existen en este CSS.
- `CardContent` — Cuerpo de la tarjeta.
- `CardFooter` — Zona inferior para acciones. Omítela si no hay ninguna.

