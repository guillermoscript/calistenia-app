---
category: Surfaces
---

Un único bloque plegable, sin la semántica de grupo del `Accordion`. Para «ver más» o detalles secundarios.

## Composición

```jsx
<Collapsible>
  <CollapsibleTrigger className="text-sm text-muted-foreground">Ver desglose</CollapsibleTrigger>
  <CollapsibleContent className="pt-2 text-sm">
    Proteína 140 g · Carbohidratos 320 g · Grasa 70 g
  </CollapsibleContent>
</Collapsible>
```

## Piezas

- `CollapsibleTrigger` — El control que abre y cierra el bloque.
- `CollapsibleContent` — El contenido plegado.

