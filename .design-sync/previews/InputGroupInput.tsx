import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@calistenia/web'

export const EnUnGrupo = () => (
  <InputGroup className="w-72">
    <InputGroupInput defaultValue="78,2" inputMode="decimal" />
    <InputGroupAddon><InputGroupText>kg</InputGroupText></InputGroupAddon>
  </InputGroup>
)
