---
category: Surfaces
---

Contenedor con scroll y barra estilizada. Necesita una altura acotada (`className="h-64"` o similar) o no habrá scroll.

## Composición

```jsx
<ScrollArea className="h-64 rounded-md border p-4">
  <div className="space-y-2">
    {ejercicios.map((e) => <div key={e.id} className="text-sm">{e.nombre}</div>)}
  </div>
</ScrollArea>
```

## Piezas

- `ScrollBar` — La barra de scroll. `ScrollArea` ya la incluye; solo se usa suelta para una horizontal explícita.

