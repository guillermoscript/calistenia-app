import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from '@calistenia/web'

// Se renderiza abierto a propósito: el estado cerrado no muestra nada.
// `cardMode: single` en la config mantiene el overlay dentro de la tarjeta.
export const RegistrarPeso = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Registrar peso</DialogTitle>
        <DialogDescription>
          Se guarda en tu histórico de composición corporal.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2 py-2">
        <Label htmlFor="d-kg">Peso (kg)</Label>
        <Input id="d-kg" inputMode="decimal" defaultValue="78,2" />
      </div>
      <DialogFooter>
        <Button variant="outline">Cancelar</Button>
        <Button>Guardar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
