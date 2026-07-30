---
category: Overlays
---

Panel que entra desde un borde. Es el patrón de overlay preferido en móvil. `side="bottom"` para acciones y formularios cortos; `side="right"` para navegación o filtros en escritorio.

## Composición

```jsx
<Sheet>
  <SheetTrigger asChild><Button variant="outline">Filtros</Button></SheetTrigger>
  <SheetContent side="bottom">
    <SheetHeader>
      <SheetTitle>Filtrar ejercicios</SheetTitle>
      <SheetDescription>Por grupo muscular y equipamiento.</SheetDescription>
    </SheetHeader>
    <div className="grid gap-4 py-4">{/* controles */}</div>
    <SheetFooter>
      <Button>Aplicar</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

## Piezas

- `SheetTrigger` — Abre el panel. Usa `asChild` con tu propio botón.
- `SheetContent` — El panel. `side` decide el borde: `top`, `right`, `bottom`, `left`.
- `SheetHeader` — Agrupa `SheetTitle` y `SheetDescription`.
- `SheetTitle` — Título del panel. Obligatorio para accesibilidad.
- `SheetDescription` — Texto de apoyo bajo el título.
- `SheetFooter` — Zona de acciones al pie del panel.
- `SheetClose` — Cierra el panel. Con `asChild` envuelve tu botón.
- `SheetOverlay` — El fondo oscurecido. `SheetContent` ya lo monta.
- `SheetPortal` — Portal al final del body. `SheetContent` ya lo monta.

