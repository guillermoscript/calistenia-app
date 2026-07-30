import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@calistenia/web'

// El disparador suelto no muestra valor ni lista: va dentro de Select.
export const EnUnSelect = () => (
  <Select defaultValue="intermedio">
    <SelectTrigger className="w-56">
      <SelectValue placeholder="Elige nivel" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="principiante">Principiante</SelectItem>
      <SelectItem value="intermedio">Intermedio</SelectItem>
      <SelectItem value="avanzado">Avanzado</SelectItem>
    </SelectContent>
  </Select>
)
