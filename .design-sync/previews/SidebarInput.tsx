import { Sidebar, SidebarContent, SidebarHeader, SidebarInput, SidebarProvider } from '@calistenia/web'

// Las piezas de la barra necesitan SidebarProvider; sueltas renderizan vacías.
export const EnLaBarra = () => (
  <SidebarProvider className="min-h-0">
    <Sidebar collapsible="none" className="h-72 w-64 border-r border-sidebar-border">
      <SidebarHeader><SidebarInput placeholder="Buscar…" /></SidebarHeader>
      <SidebarContent />
    </Sidebar>
  </SidebarProvider>
)
