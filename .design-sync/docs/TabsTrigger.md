---
category: Navigation
---

Una pestaña. Su `value` debe coincidir con el del `TabsContent`.

Parte de la familia `Tabs`. Se usa dentro de `<Tabs>`, no por separado.

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

