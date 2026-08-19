import { Button } from '@calistenia/web'
import { Plus, Play, Share2, Trash2 } from 'lucide-react'

export const Variantes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Empezar sesión</Button>
    <Button variant="secondary">Ver programa</Button>
    <Button variant="outline">Cambiar día</Button>
    <Button variant="ghost">Saltar</Button>
    <Button variant="destructive">Abandonar</Button>
    <Button variant="link">Ver histórico</Button>
  </div>
)

export const Lima = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="limeSolid">Empezar entreno</Button>
    <Button variant="lime">Ver el plan</Button>
    <Button variant="danger">Bloquear usuario</Button>
  </div>
)

export const Tamaños = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="lg">Empezar entreno</Button>
    <Button size="default">Registrar serie</Button>
    <Button size="sm">Añadir</Button>
    <Button size="icon" aria-label="Añadir ejercicio"><Plus /></Button>
    <Button size="icon-sm" variant="ghost" aria-label="Compartir"><Share2 /></Button>
  </div>
)

export const ConIconos = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button><Play /> Reanudar sesión</Button>
    <Button variant="outline"><Plus /> Nuevo programa</Button>
    <Button variant="destructive"><Trash2 /> Eliminar registro</Button>
  </div>
)

export const Estados = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>Guardando…</Button>
    <Button variant="outline" disabled>Sin conexión</Button>
    <Button variant="secondary" disabled>Completado</Button>
  </div>
)
