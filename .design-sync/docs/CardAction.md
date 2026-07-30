---
category: Surfaces
---

Envoltorio sin estilos propios (es un `div` pelado). **No alinea ni posiciona nada por sí mismo.** Para poner una acción arriba a la derecha, maqueta tú la cabecera: `<CardHeader className="flex-row items-start justify-between gap-2 space-y-0">` y mete la acción como segundo hijo. Nada de `grid-cols-[1fr_auto]`: los valores arbitrarios no existen en este CSS.

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

