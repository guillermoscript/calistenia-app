---
category: Forms
---

Campo con elementos pegados: prefijos, sufijos de unidad o un botón de acción. Evita el `Input` suelto con un icono posicionado a mano.

## Composición

```jsx
<InputGroup>
  <InputGroupInput placeholder="Buscar ejercicio…" />
  <InputGroupAddon>
    <InputGroupButton><Search /></InputGroupButton>
  </InputGroupAddon>
</InputGroup>
```

## Piezas

- `InputGroupInput` — El campo de texto dentro del grupo. Sustituye a `Input`.
- `InputGroupTextarea` — Variante multilínea dentro del grupo.
- `InputGroupAddon` — Contenedor pegado al campo, para iconos, unidades o botones.
- `InputGroupButton` — Botón dentro de un `InputGroupAddon`.
- `InputGroupText` — Texto estático dentro de un `InputGroupAddon` («kg», «min/km»).

