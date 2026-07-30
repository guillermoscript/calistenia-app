---
category: Overlays
---

Zona de acciones, alineadas a la derecha.

Parte de la familia `Dialog`. Se usa dentro de `<Dialog>`, no por separado.

## Composición

```jsx
<Dialog>
  <DialogTrigger asChild><Button>Registrar peso</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Registrar peso</DialogTitle>
      <DialogDescription>Se guarda en tu histórico de composición corporal.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-2">
      <Label htmlFor="kg">Peso (kg)</Label>
      <Input id="kg" type="number" inputMode="decimal" />
    </div>
    <DialogFooter>
      <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
      <Button>Guardar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

