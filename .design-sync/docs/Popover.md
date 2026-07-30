---
category: Overlays
---

Panel flotante anclado a un disparador, para contenido interactivo corto (un selector de fecha, un ajuste rápido). Si solo es texto explicativo usa `Tooltip`.

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

## Piezas

- `PopoverTrigger` — Ancla y abre el panel. Usa `asChild`.
- `PopoverContent` — El panel flotante. Dale ancho con `className`.

