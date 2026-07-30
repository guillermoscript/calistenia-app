---
category: Overlays
---

El elemento que abre la tarjeta al pasar el cursor.

Parte de la familia `HoverCard`. Se usa dentro de `<HoverCard>`, no por separado.

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

