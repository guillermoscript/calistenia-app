import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@calistenia/web'
import { Search } from 'lucide-react'

export const EnUnGrupo = () => (
  <InputGroup className="w-72">
    <InputGroupInput placeholder="Buscar ejercicio…" />
    <InputGroupAddon>
      <InputGroupButton aria-label="Buscar"><Search /></InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
)
