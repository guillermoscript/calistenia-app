---
category: Overlays
---

Obligatorio en un ancestro (normalmente en la raíz de la app). Sin él los tooltips no se muestran.

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

