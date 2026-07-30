import { Progress } from '@calistenia/web'

export const ConCifra = () => (
  <div className="grid w-80 gap-2">
    <div className="flex justify-between text-sm">
      <span>Semana 3 de 8</span>
      <span className="text-muted-foreground">37%</span>
    </div>
    <Progress value={37} />
  </div>
)

export const Escala = () => (
  <div className="grid w-80 gap-4">
    {[
      ['Sin empezar', 0],
      ['Calentamiento', 15],
      ['Bloque principal', 60],
      ['Casi', 90],
      ['Completado', 100],
    ].map(([etiqueta, valor]) => (
      <div key={etiqueta as string} className="grid gap-1.5">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{etiqueta}</span>
          <span>{valor}%</span>
        </div>
        <Progress value={valor as number} />
      </div>
    ))}
  </div>
)
