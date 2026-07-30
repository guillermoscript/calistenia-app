---
category: Overlays
---

Tarjeta de vista previa al pasar el cursor, con más contenido que un `Tooltip` (perfil de un amigo, resumen de un ejercicio). Solo escritorio: no se activa por toque.

## Composición

```jsx
<HoverCard>
  <HoverCardTrigger className="font-medium underline-offset-4 hover:underline">@guille</HoverCardTrigger>
  <HoverCardContent className="w-64">
    <div className="flex gap-3">
      <Avatar><AvatarFallback>GM</AvatarFallback></Avatar>
      <div className="text-sm">
        <p className="font-medium">Guillermo</p>
        <p className="text-muted-foreground">Racha de 12 días</p>
      </div>
    </div>
  </HoverCardContent>
</HoverCard>
```

## Piezas

- `HoverCardTrigger` — El elemento que abre la tarjeta al pasar el cursor.
- `HoverCardContent` — El panel de vista previa. Dale ancho con `className`.

