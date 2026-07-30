---
category: Feedback
---

Lo que se muestra si la imagen falta o falla. Iniciales, siempre presente.

Parte de la familia `Avatar`. Se usa dentro de `<Avatar>`, no por separado.

## Composición

```jsx
<Avatar>
  <AvatarImage src={usuario.avatar} alt={usuario.nombre} />
  <AvatarFallback>GM</AvatarFallback>
</Avatar>
```

