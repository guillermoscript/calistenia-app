import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@calistenia/web'

export const EnUnBuscador = () => (
  <Command className="w-80 rounded-lg border border-border">
    <CommandInput placeholder="Buscar ejercicio…" />
    <CommandList>
      <CommandEmpty>Sin resultados.</CommandEmpty>
      <CommandGroup heading="Tirón">
        <CommandItem>Dominadas</CommandItem>
        <CommandItem>Remo invertido</CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
)
