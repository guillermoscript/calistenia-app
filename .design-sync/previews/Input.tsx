import { Input, Label } from '@calistenia/web'

export const ConEtiqueta = () => (
  <div className="grid w-72 gap-2">
    <Label htmlFor="p-nombre">Nombre del programa</Label>
    <Input id="p-nombre" defaultValue="Balance total" />
  </div>
)

export const Numerico = () => (
  <div className="flex w-72 gap-3">
    <div className="grid flex-1 gap-2">
      <Label htmlFor="p-series">Series</Label>
      <Input id="p-series" type="number" inputMode="numeric" defaultValue={4} />
    </div>
    <div className="grid flex-1 gap-2">
      <Label htmlFor="p-reps">Reps</Label>
      <Input id="p-reps" type="number" inputMode="numeric" defaultValue={8} />
    </div>
  </div>
)

export const Estados = () => (
  <div className="grid w-72 gap-4">
    <div className="grid gap-2">
      <Label htmlFor="p-vacio">Peso corporal (kg)</Label>
      <Input id="p-vacio" type="number" inputMode="decimal" placeholder="78,5" />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="p-off" className="text-muted-foreground">Sincronizado desde la báscula</Label>
      <Input id="p-off" defaultValue="78,2 kg" disabled />
    </div>
  </div>
)
