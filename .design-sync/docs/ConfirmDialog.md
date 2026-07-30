---
category: Overlays
---

Confirmación de acción destructiva, ya montada: título, descripción, cancelar y confirmar. Úsala en vez de componer un `Dialog` a mano para borrar, abandonar sesión o descartar cambios.

## Composición

```jsx
<ConfirmDialog
  open={abierto}
  onOpenChange={setAbierto}
  title="¿Abandonar la sesión?"
  description="Perderás las series que no hayas registrado."
  confirmText="Abandonar"
  onConfirm={abandonar}
/>
```

