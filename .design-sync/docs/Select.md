---
category: Forms
---

Selección de una opción entre pocas. `SelectValue` necesita `placeholder` para el estado vacío. Para listas largas o con búsqueda usa `Command`.

## Composición

```jsx
<Select defaultValue="intermedio">
  <SelectTrigger className="w-48">
    <SelectValue placeholder="Elige nivel" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="principiante">Principiante</SelectItem>
    <SelectItem value="intermedio">Intermedio</SelectItem>
    <SelectItem value="avanzado">Avanzado</SelectItem>
  </SelectContent>
</Select>
```

## Piezas

- `SelectTrigger` — El control visible que abre la lista. Contiene `SelectValue`.
- `SelectValue` — Muestra la opción elegida, o `placeholder` si no hay ninguna.
- `SelectContent` — El panel flotante con las opciones.
- `SelectItem` — Una opción. `value` es obligatorio.
- `SelectGroup` — Agrupa opciones relacionadas; se etiqueta con `SelectLabel`.
- `SelectLabel` — Título de un `SelectGroup`. No es seleccionable.
- `SelectSeparator` — Línea divisoria entre grupos de opciones.

