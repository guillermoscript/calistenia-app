// ── DOM a prueba del traductor del navegador (GYM-GUILLE-27) ─────────────────
//
// Chrome ofrece traducir la página a quien no lee español (el 20-09 pasó con un
// usuario polaco en `/es/auth`). Al traducir, el navegador NO edita el texto en
// su sitio: parte cada nodo de texto y lo envuelve en un `<font>` propio, así
// que el nodo que React anotó como hijo de un `<span>` pasa a colgar de ese
// `<font>`. Cuando después React desmonta ese trozo —en el onboarding basta con
// teclear el peso objetivo para que aparezcan y desaparezcan los avisos de IMC—
// llama a `parent.removeChild(nodo)` con el padre viejo y el navegador lanza
// `NotFoundError: The node to be removed is not a child of this node`.
//
// No hay ErrorBoundary por encima, así que el fallo sube hasta la raíz, React
// desmonta el árbol entero y la página se queda EN BLANCO: el usuario se queda
// sin registrarse. Tampoco es el fallo de un componente concreto —cualquier
// texto condicional de la app puede provocarlo—, así que el remedio va en la
// raíz: si el nodo ya no cuelga de donde React cree, la eliminación ya la hizo
// el traductor y no hay nada que borrar.
//
// El precio es que puede quedarse en pantalla el `<font>` traducido hasta el
// siguiente render del padre. Preferible a perder la sesión entera.
//
// Es el remedio de facebook/react#11538, el mismo que usan otras apps con
// traducción automática encima.

let installed = false

export function installTranslateSafeDom(): void {
  if (installed) return
  if (typeof Node !== 'function' || !Node.prototype) return
  installed = true

  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    // El traductor ya se lo llevó a otro padre: React quería que desapareciera
    // de aquí y de aquí ya no está.
    if (child.parentNode !== this) return child
    return originalRemoveChild.call(this, child) as T
  }

  const originalInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    // Misma avería por el otro lado: la referencia ante la que React quiere
    // insertar ya cuelga de un `<font>`. Se inserta al final en vez de reventar.
    if (referenceNode && referenceNode.parentNode !== this) {
      return originalInsertBefore.call(this, newNode, null) as T
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T
  }
}
