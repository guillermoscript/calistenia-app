import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider } from '@calistenia/web'

// Las piezas de la barra necesitan SidebarProvider; sueltas renderizan vacías.
export const EnLaBarra = () => (
  <SidebarProvider className="min-h-0">
    <Sidebar collapsible="none" className="h-72 w-64 border-r border-sidebar-border">
      <SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive>Progreso</SidebarMenuButton>
          <SidebarMenuSub>
            <SidebarMenuSubItem><SidebarMenuSubButton>Fuerza</SidebarMenuSubButton></SidebarMenuSubItem>
            <SidebarMenuSubItem><SidebarMenuSubButton>Cardio</SidebarMenuSubButton></SidebarMenuSubItem>
            <SidebarMenuSubItem><SidebarMenuSubButton>Cuerpo</SidebarMenuSubButton></SidebarMenuSubItem>
          </SidebarMenuSub>
        </SidebarMenuItem>
      </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
    </Sidebar>
  </SidebarProvider>
)
