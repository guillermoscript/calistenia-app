import { Label, Textarea } from '@calistenia/web'

export const ConEtiqueta = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="t-notas">Notas de la sesión</Label>
    <Textarea
      id="t-notas"
      rows={4}
      defaultValue="Buenas sensaciones en el tirón. El hombro derecho molesta en la última serie."
    />
  </div>
)

export const Vacio = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="t-desc">Descripción del programa</Label>
    <Textarea id="t-desc" rows={3} placeholder="Para quién es y qué busca desarrollar…" />
  </div>
)
