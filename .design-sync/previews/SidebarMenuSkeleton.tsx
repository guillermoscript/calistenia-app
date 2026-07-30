import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuSkeleton, SidebarProvider } from '@calistenia/web'

// Las piezas de la barra necesitan SidebarProvider; sueltas renderizan vacías.
export const Cargando = () => (
  <SidebarProvider className="min-h-0">
    <Sidebar collapsible="none" className="h-72 w-64 border-r border-sidebar-border">
      <SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>
        {[0, 1, 2, 3].map((i) => (
          <SidebarMenuItem key={i}><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
        ))}
      </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
    </Sidebar>
  </SidebarProvider>
)
