---
category: Sidebar
---

Navegación lateral de la app en escritorio, colapsable. **Requiere `SidebarProvider` envolviendo la página** y `SidebarInset` para el contenido principal. El indicador lima de 2px en el elemento activo lo pinta el CSS del sistema vía `data-active="true"` — no lo replique a mano.

## Composición

```jsx
<SidebarProvider>
  <Sidebar>
    <SidebarHeader>Calistenia</SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Entrenar</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive>Hoy</SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>Programas</SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>Perfil</SidebarFooter>
  </Sidebar>
  <SidebarInset>{/* contenido de la página */}</SidebarInset>
</SidebarProvider>
```

## Piezas

- `SidebarProvider` — Obligatorio: envuelve toda la página y aporta el estado de colapso.
- `SidebarInset` — El contenido principal junto a la barra. Hermano de `Sidebar` dentro del provider.
- `SidebarTrigger` — Botón que colapsa y expande la barra.
- `SidebarRail` — Franja fina pulsable en el borde para colapsar.
- `SidebarHeader` — Zona superior fija de la barra (logo, selector de cuenta).
- `SidebarContent` — Zona central con scroll que contiene los grupos.
- `SidebarFooter` — Zona inferior fija (perfil, ajustes).
- `SidebarSeparator` — Línea divisoria dentro de la barra.
- `SidebarGroup` — Una sección de la navegación.
- `SidebarGroupLabel` — Título de la sección. Se atenúa al colapsar.
- `SidebarGroupContent` — Contenido de la sección; normalmente un `SidebarMenu`.
- `SidebarGroupAction` — Acción en la cabecera de la sección (por ejemplo, «añadir»).
- `SidebarMenu` — Lista de elementos de navegación.
- `SidebarMenuItem` — Un elemento de la lista. Envuelve a `SidebarMenuButton`.
- `SidebarMenuButton` — El enlace pulsable. `isActive` pinta el indicador lima.
- `SidebarMenuAction` — Acción secundaria a la derecha de un elemento.
- `SidebarMenuBadge` — Contador o etiqueta a la derecha de un elemento.
- `SidebarMenuSkeleton` — Marcador de carga con la forma de un elemento de menú.
- `SidebarMenuSub` — Lista anidada bajo un elemento.
- `SidebarMenuSubItem` — Un elemento de la lista anidada.
- `SidebarMenuSubButton` — El enlace pulsable de un elemento anidado.
- `SidebarInput` — Campo de búsqueda con el estilo de la barra.

