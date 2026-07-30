---
category: Feedback
---

Mensaje en línea sobre el estado de la página o de una acción. No lo uses para notificaciones transitorias — eso es un toast (`sonner`).

## Composición

```jsx
<Alert>
  <AlertTitle>Sesión sin terminar</AlertTitle>
  <AlertDescription>
    Tienes una sesión de ayer a medias. Puedes reanudarla o descartarla.
  </AlertDescription>
</Alert>
<Alert variant="destructive">
  <AlertTitle>No se pudo sincronizar</AlertTitle>
  <AlertDescription>Revisa tu conexión; los datos siguen guardados en el dispositivo.</AlertDescription>
</Alert>
```

## Piezas

- `AlertTitle` — Titular del aviso, en una línea.
- `AlertDescription` — El detalle y, si procede, qué hacer al respecto.

