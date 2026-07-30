import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@calistenia/web'
import { MoreVertical } from 'lucide-react'

// Abierto a propósito: el disparador cerrado es solo un botón.
export const MenuAbierto = () => (
  <DropdownMenu open>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-sm" aria-label="Más opciones"><MoreVertical /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuLabel>Sesión</DropdownMenuLabel>
      <DropdownMenuItem>Duplicar</DropdownMenuItem>
      <DropdownMenuItem>Compartir</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive">Eliminar</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)
