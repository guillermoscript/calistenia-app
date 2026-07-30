---
category: Surfaces
---

Secciones plegables. `type="single" collapsible` para una abierta a la vez; `type="multiple"` para varias. Cada `AccordionItem` necesita un `value` único.

## Composición

```jsx
<Accordion type="single" collapsible>
  <AccordionItem value="calentamiento">
    <AccordionTrigger>Calentamiento</AccordionTrigger>
    <AccordionContent>Movilidad de hombro, 5 min de salto de comba.</AccordionContent>
  </AccordionItem>
  <AccordionItem value="principal">
    <AccordionTrigger>Bloque principal</AccordionTrigger>
    <AccordionContent>Dominadas, fondos, remo invertido.</AccordionContent>
  </AccordionItem>
</Accordion>
```

## Piezas

- `AccordionItem` — Una sección. `value` único obligatorio.
- `AccordionTrigger` — La cabecera pulsable que abre y cierra la sección.
- `AccordionContent` — El contenido que se despliega.

