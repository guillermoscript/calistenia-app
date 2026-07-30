---
category: Surfaces
---

Título de la tarjeta. Trae `font-semibold` de base, así que para títulos de impacto usa `className="font-bebas font-normal text-2xl tracking-wide"` — **`font-normal` es obligatorio**: Bebas tiene un solo peso y sin él el navegador le aplica bold sintético.

Parte de la familia `Card`. Se usa dentro de `<Card>`, no por separado.

## Composición

```jsx
<Card>
  <CardHeader>
    <CardTitle>Dominadas</CardTitle>
    <CardDescription>4 series · 8 repeticiones</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">Último registro: 4×7 hace 3 días</p>
  </CardContent>
  <CardFooter>
    <Button size="sm">Registrar serie</Button>
  </CardFooter>
</Card>
```

