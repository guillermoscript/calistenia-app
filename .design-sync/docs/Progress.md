---
category: Feedback
---

Barra de progreso determinada, con `value` de 0 a 100. Para progreso indeterminado usa `Spinner`. Emparéjala siempre con una cifra en texto: la barra sola no dice cuánto falta.

## Composición

```jsx
<div className="grid gap-2">
  <div className="flex justify-between text-sm">
    <span>Semana 3 de 8</span>
    <span className="text-muted-foreground">37%</span>
  </div>
  <Progress value={37} />
</div>
```

