import { useEffect } from 'react'

const DEFAULT_TITLE = 'Calistenia App'

/**
 * Ajusta <title> y la meta description mientras la página esté montada.
 * Restaura los valores originales al desmontar — la app es una SPA y estas
 * páginas públicas son las únicas que necesitan metadatos propios.
 */
export function useDocumentMeta(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title ? `${title} · ${DEFAULT_TITLE}` : DEFAULT_TITLE

    const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescription = tag?.content
    if (tag && description) tag.content = description

    return () => {
      document.title = previousTitle
      if (tag && previousDescription !== undefined) tag.content = previousDescription
    }
  }, [title, description])
}
