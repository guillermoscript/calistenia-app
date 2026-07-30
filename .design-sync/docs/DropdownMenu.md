---
category: Overlays
---

Menú de acciones anclado a un botón. Para acciones, no para elegir un valor de formulario — eso es `Select`.

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

## Piezas

- `DropdownMenuTrigger` — Abre el menú. Usa `asChild`.
- `DropdownMenuContent` — El panel del menú. `align="end"` lo alinea al borde del disparador.
- `DropdownMenuItem` — Una acción. Para destructivas añade `className="text-destructive"`.
- `DropdownMenuLabel` — Título de una sección del menú. No es pulsable.
- `DropdownMenuGroup` — Agrupa acciones relacionadas.
- `DropdownMenuSeparator` — Línea divisoria entre grupos de acciones.

