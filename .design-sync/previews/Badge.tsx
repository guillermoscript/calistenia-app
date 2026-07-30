import { Badge } from '@calistenia/web'

export const Variantes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Activo</Badge>
    <Badge variant="secondary">Tirón</Badge>
    <Badge variant="outline">Intermedio</Badge>
    <Badge variant="destructive">Fallida</Badge>
  </div>
)

export const Estados = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge className="bg-lime text-lime-foreground">Completado</Badge>
    <Badge variant="outline" className="border-lime/40 text-lime">En curso</Badge>
    <Badge variant="secondary">Pendiente</Badge>
    <Badge variant="outline" className="text-muted-foreground">Descanso</Badge>
  </div>
)

export const Categorias = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">Empuje</Badge>
    <Badge variant="secondary">Tirón</Badge>
    <Badge variant="secondary">Core</Badge>
    <Badge variant="secondary">Pierna</Badge>
    <Badge variant="secondary">Movilidad</Badge>
  </div>
)
