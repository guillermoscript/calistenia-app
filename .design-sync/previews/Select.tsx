import {
  Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@calistenia/web'

export const Nivel = () => (
  <div className="grid w-64 gap-2">
    <Label>Nivel</Label>
    <Select defaultValue="intermedio">
      <SelectTrigger>
        <SelectValue placeholder="Elige nivel" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="principiante">Principiante</SelectItem>
        <SelectItem value="intermedio">Intermedio</SelectItem>
        <SelectItem value="avanzado">Avanzado</SelectItem>
      </SelectContent>
    </Select>
  </div>
)

export const Vacio = () => (
  <div className="grid w-64 gap-2">
    <Label>Grupo muscular</Label>
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Todos los grupos" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="empuje">Empuje</SelectItem>
        <SelectItem value="tiron">Tirón</SelectItem>
        <SelectItem value="core">Core</SelectItem>
      </SelectContent>
    </Select>
  </div>
)

export const Deshabilitado = () => (
  <div className="grid w-64 gap-2">
    <Label className="text-muted-foreground">Programa (en curso)</Label>
    <Select defaultValue="balance" disabled>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="balance">Balance total</SelectItem>
      </SelectContent>
    </Select>
  </div>
)
