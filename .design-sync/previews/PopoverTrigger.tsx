import { Button, Input, Label, Popover, PopoverContent, PopoverTrigger } from '@calistenia/web'
import { Settings } from 'lucide-react'

// Abierto a propósito: el disparador cerrado es solo un botón.
export const PanelAbierto = () => (
  <Popover open>
    <PopoverTrigger asChild>
      <Button variant="outline" size="icon-sm" aria-label="Ajustes"><Settings /></Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64">
      <div className="grid gap-3">
        <Label htmlFor="pv-desc">Descanso entre series (s)</Label>
        <Input id="pv-desc" type="number" inputMode="numeric" defaultValue={90} />
      </div>
    </PopoverContent>
  </Popover>
)
