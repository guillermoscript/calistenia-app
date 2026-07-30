import { Label, Separator, Switch } from '@calistenia/web'

export const Ajustes = () => (
  <div className="w-80 space-y-3">
    <div className="flex items-center justify-between">
      <Label htmlFor="s-rec">Recordatorios diarios</Label>
      <Switch id="s-rec" defaultChecked />
    </div>
    <Separator />
    <div className="flex items-center justify-between">
      <Label htmlFor="s-snd">Sonidos de la sesión</Label>
      <Switch id="s-snd" defaultChecked />
    </div>
    <Separator />
    <div className="flex items-center justify-between">
      <Label htmlFor="s-pub">Perfil público</Label>
      <Switch id="s-pub" />
    </div>
  </div>
)

export const Estados = () => (
  <div className="flex items-center gap-6">
    <div className="flex flex-col items-center gap-2">
      <Switch defaultChecked />
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">on</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Switch />
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">off</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <Switch defaultChecked disabled />
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">bloqueado</span>
    </div>
  </div>
)
