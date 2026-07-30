---
category: Overlays
---

El panel del menú. `align="end"` lo alinea al borde del disparador.

Parte de la familia `DropdownMenu`. Se usa dentro de `<DropdownMenu>`, no por separado.

## Composición

```jsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon-sm"><MoreVertical /></Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuLabel>Sesión</DropdownMenuLabel>
    <DropdownMenuItem>Duplicar</DropdownMenuItem>
    <DropdownMenuItem>Compartir</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem className="text-destructive">Eliminar</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

