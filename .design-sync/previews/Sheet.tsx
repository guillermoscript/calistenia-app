import {
  Badge, Button, ButtonGroup, ButtonGroupItem, Label,
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@calistenia/web'

// Se renderiza abierto a propósito: el estado cerrado no muestra nada.
// `side="bottom"` es el patrón de overlay preferido en móvil.
export const FiltrosMovil = () => (
  <Sheet open>
    <SheetContent side="bottom">
      <SheetHeader>
        <SheetTitle>Filtrar ejercicios</SheetTitle>
        <SheetDescription>Por grupo muscular y equipamiento.</SheetDescription>
      </SheetHeader>
      <div className="grid gap-4 py-4">
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-lime text-lime-foreground">Empuje</Badge>
          <Badge variant="secondary">Tirón</Badge>
          <Badge variant="secondary">Core</Badge>
          <Badge variant="secondary">Pierna</Badge>
        </div>
        <div className="flex items-center justify-between">
          <Label>Solo sin equipamiento</Label>
          <ButtonGroup>
            <ButtonGroupItem>Sí</ButtonGroupItem>
            <ButtonGroupItem>No</ButtonGroupItem>
          </ButtonGroup>
        </div>
      </div>
      <SheetFooter>
        <Button>Aplicar filtros</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)
