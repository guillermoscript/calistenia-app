---
category: Forms
---

Campo de texto de una línea. Empareja siempre con `Label` vía `htmlFor`/`id`. Para entradas numéricas de series y repeticiones usa `inputMode="numeric"`: el teclado móvil importa, la app se usa a mitad de entrenamiento.

Cuidado con los decimales en español: `type="number"` solo admite el punto como separador, así que un valor como `78,2` se descarta y el campo aparece **vacío**. Para pesos y medidas usa `inputMode="decimal"` **sin** `type="number"`, y así la coma se muestra tal cual.

## Composición

```jsx
<div className="grid gap-2">
  <Label htmlFor="reps">Repeticiones</Label>
  <Input id="reps" type="number" inputMode="numeric" placeholder="12" />
</div>
```

