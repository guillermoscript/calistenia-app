import { Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@calistenia/web'

export const HoyPlanificar = () => (
  <Tabs defaultValue="hoy" className="w-96">
    <TabsList>
      <TabsTrigger value="hoy">Hoy</TabsTrigger>
      <TabsTrigger value="planificar">Planificar</TabsTrigger>
    </TabsList>
    <TabsContent value="hoy" className="pt-3 text-sm text-muted-foreground">
      2 comidas registradas · 1 entreno pendiente
    </TabsContent>
    <TabsContent value="planificar" className="pt-3 text-sm text-muted-foreground">
      Plan de la semana que viene.
    </TabsContent>
  </Tabs>
)

export const Progreso = () => (
  <Tabs defaultValue="fuerza" className="w-96">
    <TabsList>
      <TabsTrigger value="fuerza">Fuerza</TabsTrigger>
      <TabsTrigger value="cardio">Cardio</TabsTrigger>
      <TabsTrigger value="cuerpo">Cuerpo</TabsTrigger>
    </TabsList>
    <TabsContent value="fuerza" className="pt-3">
      <Card>
        <CardContent className="pt-6">
          <p className="font-bebas font-normal text-3xl tracking-wide">4 × 9</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Récord en dominadas
          </p>
        </CardContent>
      </Card>
    </TabsContent>
    <TabsContent value="cardio" className="pt-3 text-sm text-muted-foreground">
      32 km este mes · ritmo medio 5:41 /km
    </TabsContent>
    <TabsContent value="cuerpo" className="pt-3 text-sm text-muted-foreground">
      78,2 kg · −1,4 kg en 30 días
    </TabsContent>
  </Tabs>
)
