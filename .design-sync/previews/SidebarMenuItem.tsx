import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@calistenia/web'

// Las piezas de la barra necesitan SidebarProvider; sueltas renderizan vacías.
export const EnLaBarra = () => (
  <SidebarProvider className="min-h-0">
    <Sidebar collapsible="none" className="h-72 w-64 border-r border-sidebar-border">
      <SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton isActive>Hoy</SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton>Programas</SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton>Notificaciones</SidebarMenuButton>
          <SidebarMenuBadge>3</SidebarMenuBadge>
        </SidebarMenuItem>
      </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
    </Sidebar>
  </SidebarProvider>
)
