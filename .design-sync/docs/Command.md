---
category: Overlays
---

Lista filtrable por escritura — paleta de comandos o buscador de ejercicios sobre un catálogo grande. `CommandDialog` es la versión en modal. Es la opción correcta cuando `Select` se queda corto por número de opciones.

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

## Piezas

- `CommandDialog` — Envuelve `Command` en un modal. Para el atajo global de búsqueda.
- `CommandInput` — El campo de búsqueda que filtra la lista.
- `CommandList` — Contenedor con scroll de los resultados.
- `CommandEmpty` — Lo que se muestra cuando no hay coincidencias. Inclúyelo siempre.
- `CommandGroup` — Agrupa resultados bajo un `heading`.
- `CommandItem` — Un resultado seleccionable.
- `CommandSeparator` — Línea divisoria entre grupos.
- `CommandShortcut` — Atajo de teclado alineado a la derecha de un `CommandItem`.

