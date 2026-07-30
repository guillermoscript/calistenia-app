import { Avatar, AvatarFallback } from '@calistenia/web'

export const Iniciales = () => (
  <div className="flex items-center gap-3">
    <Avatar><AvatarFallback>GM</AvatarFallback></Avatar>
    <div className="text-sm">
      <p className="font-medium">Guillermo</p>
      <p className="text-muted-foreground">Racha de 12 días</p>
    </div>
  </div>
)

export const Grupo = () => (
  <div className="flex items-center">
    {['GM', 'AL', 'RS', 'JP'].map((ini, i) => (
      <Avatar key={ini} className={i > 0 ? '-ml-2 ring-2 ring-background' : 'ring-2 ring-background'}>
        <AvatarFallback>{ini}</AvatarFallback>
      </Avatar>
    ))}
    <span className="ml-3 text-sm text-muted-foreground">y 8 más entrenando hoy</span>
  </div>
)

export const Tamaños = () => (
  <div className="flex items-center gap-3">
    <Avatar className="size-8"><AvatarFallback className="text-xs">GM</AvatarFallback></Avatar>
    <Avatar><AvatarFallback>GM</AvatarFallback></Avatar>
    <Avatar className="size-14"><AvatarFallback className="text-lg">GM</AvatarFallback></Avatar>
  </div>
)
