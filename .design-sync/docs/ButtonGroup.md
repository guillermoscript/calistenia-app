---
category: Actions
---

Agrupa acciones relacionadas en un bloque con bordes compartidos. Útil para selectores de unidad (kg/lb) o de rango temporal en las vistas de progreso.

## Composición

```jsx
<ButtonGroup>
  <ButtonGroupItem>Semana</ButtonGroupItem>
  <ButtonGroupItem data-active>Mes</ButtonGroupItem>
  <ButtonGroupItem>Año</ButtonGroupItem>
</ButtonGroup>
```

## Piezas

- `ButtonGroupItem` — Un botón dentro del grupo. Hereda los bordes compartidos.
- `ButtonGroupText` — Texto no interactivo dentro del grupo (sufijos tipo «kg», «reps»).

