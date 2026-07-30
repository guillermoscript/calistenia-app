---
category: Overlays
---

Agrupa `SheetTitle` y `SheetDescription`.

Parte de la familia `Sheet`. Se usa dentro de `<Sheet>`, no por separado.

## Composición

```jsx
<Sheet>
  <SheetTrigger asChild><Button variant="outline">Filtros</Button></SheetTrigger>
  <SheetContent side="bottom">
    <SheetHeader>
      <SheetTitle>Filtrar ejercicios</SheetTitle>
      <SheetDescription>Por grupo muscular y equipamiento.</SheetDescription>
    </SheetHeader>
    <div className="grid gap-4 py-4">{/* controles */}</div>
    <SheetFooter>
      <Button>Aplicar</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

