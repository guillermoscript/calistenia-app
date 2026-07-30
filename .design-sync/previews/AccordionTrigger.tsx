import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@calistenia/web'

export const EnUnAcordeon = () => (
  <Accordion type="single" collapsible defaultValue="calentamiento" className="w-96">
    <AccordionItem value="calentamiento">
      <AccordionTrigger>Calentamiento</AccordionTrigger>
      <AccordionContent>Movilidad de hombro y 5 min de comba.</AccordionContent>
    </AccordionItem>
    <AccordionItem value="principal">
      <AccordionTrigger>Bloque principal</AccordionTrigger>
      <AccordionContent>Dominadas, fondos, remo invertido.</AccordionContent>
    </AccordionItem>
  </Accordion>
)
