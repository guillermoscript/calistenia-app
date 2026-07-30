---
category: Overlays
---

Etiqueta breve al pasar el cursor o enfocar. **Requiere `TooltipProvider` en un ancestro** — sin él no aparece. Solo texto: nunca metas controles dentro. No es accesible por toque en móvil, así que no pongas ahí información imprescindible.

## Composición

```jsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon-sm"><Info /></Button>
    </TooltipTrigger>
    <TooltipContent>Récord personal: 4×9</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## Piezas

- `TooltipProvider` — Obligatorio en un ancestro (normalmente en la raíz de la app). Sin él los tooltips no se muestran.
- `TooltipTrigger` — El elemento que dispara el tooltip. Usa `asChild`.
- `TooltipContent` — La burbuja de texto.

