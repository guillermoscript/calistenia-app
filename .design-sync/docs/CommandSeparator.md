---
category: Overlays
---

Línea divisoria entre grupos.

Parte de la familia `Command`. Se usa dentro de `<Command>`, no por separado.

## Composición

```jsx
<Command>
  <CommandInput placeholder="Buscar ejercicio…" />
  <CommandList>
    <CommandEmpty>Sin resultados.</CommandEmpty>
    <CommandGroup heading="Tirón">
      <CommandItem>Dominadas</CommandItem>
      <CommandItem>Remo invertido</CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="Empuje">
      <CommandItem>Fondos en paralelas</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>
```

