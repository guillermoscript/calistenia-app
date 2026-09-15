import { pb } from './pocketbase'

/**
 * URL de la portada de un programa a partir de su `id` y su `cover_image`.
 *
 * Existe porque `cover_image_url` viaja con el tamaño de la superficie que la
 * resolvió: la lista pide `400x0` (`usePrograms`) y la ficha `800x0`
 * (`useProgramDetail`). Cuando la ficha reutiliza el programa del catálogo en
 * memoria hereda la miniatura pequeña, y en un visor a pantalla completa se ve
 * borrosa. Sin `thumb` devuelve el ORIGINAL, que es lo que quiere el visor.
 *
 * Basta con `collectionName`: el SDK construye `/api/files/programs/<id>/<file>`
 * sin necesitar el registro completo.
 */
export function programCoverUrl(
  program: { id: string; cover_image?: string },
  thumb?: string,
): string | undefined {
  if (!program.cover_image) return undefined
  return pb.files.getURL(
    { collectionName: 'programs', id: program.id } as Parameters<typeof pb.files.getURL>[0],
    program.cover_image,
    thumb ? { thumb } : undefined,
  ) || undefined
}
