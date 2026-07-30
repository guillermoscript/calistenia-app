---
category: Overlays
---

El panel flotante. Dale ancho con `className`.

Parte de la familia `Popover`. Se usa dentro de `<Popover>`, no por separado.

## Composición

```jsx
<Popover>
  <PopoverTrigger asChild><Button variant="ghost" size="icon-sm"><Settings /></Button></PopoverTrigger>
  <PopoverContent className="w-64">
    <div className="grid gap-3">
      <Label htmlFor="descanso">Descanso entre series</Label>
      <Input id="descanso" type="number" inputMode="numeric" defaultValue={90} />
    </div>
  </PopoverContent>
</Popover>
```

