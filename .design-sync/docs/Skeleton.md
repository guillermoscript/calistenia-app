---
category: Surfaces
---

Marcador de carga. Debe imitar la forma del contenido que sustituye — mismo alto y ancho aproximado, no un bloque genérico.

## Composición

```jsx
<Card>
  <CardHeader className="gap-2">
    <Skeleton className="h-5 w-32" />
    <Skeleton className="h-4 w-48" />
  </CardHeader>
  <CardContent className="space-y-2">
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-2/3" />
  </CardContent>
</Card>
```

