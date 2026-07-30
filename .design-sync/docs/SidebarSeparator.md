---
category: Sidebar
---

Línea divisoria dentro de la barra.

Parte de la familia `Sidebar`. Se usa dentro de `<Sidebar>`, no por separado.

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

