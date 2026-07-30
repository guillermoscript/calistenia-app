---
category: Overlays
---

La burbuja de texto.

Parte de la familia `Tooltip`. Se usa dentro de `<Tooltip>`, no por separado.

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

