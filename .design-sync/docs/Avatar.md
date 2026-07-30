---
category: Feedback
---

Foto de perfil de usuario. **Incluye siempre `AvatarFallback`**: si la imagen no carga (o el usuario no tiene foto) sin fallback queda un hueco vacío. El fallback son las iniciales.

## Composición

```jsx
<Avatar>
  <AvatarImage src={usuario.avatar} alt={usuario.nombre} />
  <AvatarFallback>GM</AvatarFallback>
</Avatar>
```

## Piezas

- `AvatarImage` — La imagen. Necesita `alt`.
- `AvatarFallback` — Lo que se muestra si la imagen falta o falla. Iniciales, siempre presente.

