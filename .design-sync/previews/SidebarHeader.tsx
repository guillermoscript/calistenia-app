import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@calistenia/web'

// Las piezas de la barra necesitan SidebarProvider; sueltas renderizan vacías.
export const EnLaBarra = () => (
  <SidebarProvider className="min-h-0">
    <Sidebar collapsible="none" className="h-72 w-64 border-r border-sidebar-border">
      <SidebarHeader className="font-bebas font-normal text-2xl tracking-wider">CALISTENIA</SidebarHeader>
      <SidebarContent>
        <SidebarGroup><SidebarGroupContent><SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton isActive>Hoy</SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton>Programas</SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
    </Sidebar>
  </SidebarProvider>
)
