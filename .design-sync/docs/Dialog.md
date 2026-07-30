---
category: Overlays
---

Modal centrado para una decisión o un formulario corto que interrumpe el flujo. En móvil prefiere `Sheet`. Para confirmar una acción destructiva usa `ConfirmDialog`, que ya trae el patrón montado.

## Composición

```jsx
<Dialog>
  <DialogTrigger asChild><Button>Registrar peso</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Registrar peso</DialogTitle>
      <DialogDescription>Se guarda en tu histórico de composición corporal.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-2">
      <Label htmlFor="kg">Peso (kg)</Label>
      <Input id="kg" type="number" inputMode="decimal" />
    </div>
    <DialogFooter>
      <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
      <Button>Guardar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Piezas

- `DialogTrigger` — Abre el diálogo. Usa `asChild` para que tu propio botón sea el disparador.
- `DialogContent` — El panel del modal. Incluye ya el overlay y el botón de cerrar.
- `DialogHeader` — Agrupa `DialogTitle` y `DialogDescription`.
- `DialogTitle` — Título del modal. Obligatorio para accesibilidad.
- `DialogDescription` — Texto de apoyo bajo el título.
- `DialogFooter` — Zona de acciones, alineadas a la derecha.
- `DialogClose` — Cierra el modal. Con `asChild` envuelve tu botón de cancelar.
- `DialogOverlay` — El fondo oscurecido. `DialogContent` ya lo monta; rara vez se usa suelto.
- `DialogPortal` — Portal al final del body. `DialogContent` ya lo monta.

