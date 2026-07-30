---
category: Actions
---

Acción primaria del sistema. `variant="default"` es casi-negro sobre claro (y casi-blanco en oscuro): el sistema reserva el lima para estados completados/activos, no para botones. Usa `variant="outline"` para acciones secundarias y `ghost` para acciones en barras densas.

## Composición

```jsx
<Button>Empezar sesión</Button>
<Button variant="outline">Ver programa</Button>
<Button variant="ghost" size="icon-sm"><Plus /></Button>
<Button variant="destructive">Abandonar sesión</Button>
```

