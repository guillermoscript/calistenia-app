---
category: Navigation
---

Alterna entre vistas hermanas sin cambiar de página. Cada `TabsTrigger` empareja con un `TabsContent` por `value`. Usa `defaultValue` para la pestaña inicial.

## Composición

```jsx
<Tabs defaultValue="hoy">
  <TabsList>
    <TabsTrigger value="hoy">Hoy</TabsTrigger>
    <TabsTrigger value="planificar">Planificar</TabsTrigger>
  </TabsList>
  <TabsContent value="hoy">Comidas y entrenos de hoy.</TabsContent>
  <TabsContent value="planificar">Plan de la semana.</TabsContent>
</Tabs>
```

## Piezas

- `TabsList` — La fila de pestañas. Contiene los `TabsTrigger`.
- `TabsTrigger` — Una pestaña. Su `value` debe coincidir con el del `TabsContent`.
- `TabsContent` — El panel de una pestaña. Se muestra cuando su `value` está activo.

