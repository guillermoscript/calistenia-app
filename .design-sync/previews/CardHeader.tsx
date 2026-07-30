import { Card, CardDescription, CardHeader, CardTitle } from '@calistenia/web'

// CardHeader suelto es un div vacío. Su render verdadero es dentro de Card.
export const EnUnaTarjeta = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Dominadas</CardTitle>
      <CardDescription>4 series · 8 repeticiones</CardDescription>
    </CardHeader>
  </Card>
)
