---
category: Forms
---

El panel flotante con las opciones.

Parte de la familia `Select`. Se usa dentro de `<Select>`, no por separado.

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

