---
category: Surfaces
---

La barra de scroll. `ScrollArea` ya la incluye; solo se usa suelta para una horizontal explícita.

Parte de la familia `ScrollArea`. Se usa dentro de `<ScrollArea>`, no por separado.

## Composición

```jsx
<ScrollArea className="h-64 rounded-md border p-4">
  <div className="space-y-2">
    {ejercicios.map((e) => <div key={e.id} className="text-sm">{e.nombre}</div>)}
  </div>
</ScrollArea>
```

