import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@calistenia/web'

export const EnUnPlegable = () => (
  <Collapsible defaultOpen className="w-80">
    <CollapsibleTrigger className="text-sm text-muted-foreground">
      Ver desglose de macros
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-2 text-sm">
      Proteína 140 g · Carbohidratos 320 g · Grasa 70 g
    </CollapsibleContent>
  </Collapsible>
)
