import { InputGroup, InputGroupTextarea } from '@calistenia/web'

export const EnUnGrupo = () => (
  <InputGroup className="w-80">
    <InputGroupTextarea
      rows={3}
      defaultValue="Buenas sensaciones en el tirón. Subir a 4×9 la semana que viene."
    />
  </InputGroup>
)
