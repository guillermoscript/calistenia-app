import {
  Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Badge, Progress,
} from '@calistenia/web'
import { MoreVertical } from 'lucide-react'

export const Sesion = () => (
  <Card className="w-80">
    {/* `CardAction` no posiciona nada por sí solo: la cabecera se maqueta en
        grid de dos columnas y la acción va como segundo hijo. */}
    <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
      <div className="space-y-1.5">
        <CardTitle>Empuje · Día 2</CardTitle>
        <CardDescription>5 ejercicios · ~45 min</CardDescription>
      </div>
      <CardAction>
        <Button variant="ghost" size="icon-sm" aria-label="Más opciones"><MoreVertical /></Button>
      </CardAction>
    </CardHeader>
    <CardContent className="space-y-1 text-sm text-muted-foreground">
      <p>Fondos en paralelas · Flexiones arqueras · Pike push-up</p>
      <p>Último intento: hace 4 días</p>
    </CardContent>
    <CardFooter>
      <Button size="sm">Empezar sesión</Button>
    </CardFooter>
  </Card>
)

export const Estadistica = () => (
  <Card className="w-56">
    <CardHeader className="pb-2">
      <CardDescription className="font-mono text-[10px] uppercase tracking-widest">
        Racha actual
      </CardDescription>
      <CardTitle className="font-bebas font-normal text-5xl tracking-wide">12</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-xs text-muted-foreground">días seguidos entrenando</p>
    </CardContent>
  </Card>
)

export const Ejercicio = () => (
  <Card className="w-80">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center justify-between text-base">
        Dominadas
        <Badge className="bg-lime text-lime-foreground">Completado</Badge>
      </CardTitle>
      <CardDescription>4 series · 8 repeticiones</CardDescription>
    </CardHeader>
    <CardContent className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Series completadas</span>
        <span>4 / 4</span>
      </div>
      <Progress value={100} />
    </CardContent>
  </Card>
)

export const Programa = () => (
  <Card className="w-80">
    <CardHeader>
      <CardDescription className="font-mono text-[10px] uppercase tracking-widest">
        Programa activo
      </CardDescription>
      <CardTitle className="font-bebas font-normal text-3xl tracking-wide">Balance total</CardTitle>
      <CardDescription>Intermedio · 8 semanas</CardDescription>
    </CardHeader>
    <CardContent className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Semana 3 de 8</span>
        <span className="text-muted-foreground">37%</span>
      </div>
      <Progress value={37} />
    </CardContent>
  </Card>
)
