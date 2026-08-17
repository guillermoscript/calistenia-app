/**
 * Andamiaje común de las tarjetas para compartir dibujadas en canvas (#531).
 *
 * Aquí vive SOLO lo que `CardioShareCard` y `RaceShareCard` hacían literalmente
 * igual: montar el lienzo, dibujar la polilínea del recorrido y exportar. La
 * maquetación de cada tarjeta se queda en su componente a propósito — no se
 * parecen tanto como aparentan (una es un mapa a sangre, la otra un podio con
 * clasificación) y fundirlas pedía un objeto de opciones con treinta campos
 * que habría dejado las dos peor.
 */
import { canvasToBlob, shareImage, type ShareImageOutcome } from './share'

/**
 * El lienzo se dibuja a 1080×1920 (formato de story) pero se maqueta en
 * coordenadas de la mitad: `ctx.scale(2, 2)` una vez y luego todo en unidades
 * de 540×960, que son las que llevan los números de cada tarjeta.
 */
export const SHARE_CARD_SCALE = 2
export const SHARE_CARD_W = 540
export const SHARE_CARD_H = 960

export interface ShareCardCanvas {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  /** Ancho en unidades ya escaladas (540). */
  w: number
  /** Alto en unidades ya escaladas (960). */
  h: number
}

/** Lienzo de story listo para maquetar, o `null` si no hay contexto 2D. */
export function createShareCardCanvas(): ShareCardCanvas | null {
  const canvas = document.createElement('canvas')
  canvas.width = SHARE_CARD_W * SHARE_CARD_SCALE
  canvas.height = SHARE_CARD_H * SHARE_CARD_SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(SHARE_CARD_SCALE, SHARE_CARD_SCALE)
  return { canvas, ctx, w: SHARE_CARD_W, h: SHARE_CARD_H }
}

/**
 * Punto ya proyectado a píxeles del lienzo. `gap` corta el trazo: es el punto
 * de reentrada tras un hueco de GPS, y unirlo con el anterior dibujaría una
 * línea recta por donde nadie pasó.
 */
export interface RoutePathPoint {
  x: number
  y: number
  gap?: boolean
}

export interface RoutePolylineStyle {
  /** Trazo de encima, del color de acento de la tarjeta. */
  stroke: string
  strokeWidth: number
  /** Contorno oscuro de debajo: es lo que mantiene la línea legible. */
  casing: string
  casingWidth: number
  dotRadius: number
  /** Relleno del punto de salida (el de meta se rellena con `stroke`). */
  startFill: string
  startRingWidth: number
  /** Color del aro del punto de meta. */
  endRing: string
  endRingWidth: number
}

/**
 * Dibuja el recorrido: contorno oscuro, trazo de acento encima, punto de salida
 * hueco y punto de meta relleno. Estaba copiado en las dos tarjetas — el propio
 * `RaceShareCard` lo admitía en un comentario («igual que en la tarjeta de
 * cardio»).
 *
 * Recibe puntos ya proyectados porque cada tarjeta los proyecta a su manera: la
 * de cardio con `pointToPixel` sobre el viewport de las teselas, la de carrera
 * con `fitRoutePath` sobre una banda sin mapa debajo.
 */
export function drawRoutePolyline(
  ctx: CanvasRenderingContext2D,
  points: RoutePathPoint[],
  style: RoutePolylineStyle,
): void {
  if (points.length < 2) return

  const buildPath = () => {
    ctx.beginPath()
    let penDown = false
    for (const p of points) {
      if (p.gap) { penDown = false; continue }
      if (!penDown) { ctx.moveTo(p.x, p.y); penDown = true }
      else ctx.lineTo(p.x, p.y)
    }
  }

  buildPath()
  ctx.strokeStyle = style.casing
  ctx.lineWidth = style.casingWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  buildPath()
  ctx.strokeStyle = style.stroke
  ctx.lineWidth = style.strokeWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  // Salida: hueca, con aro de acento.
  const first = points[0]
  ctx.beginPath()
  ctx.arc(first.x, first.y, style.dotRadius, 0, Math.PI * 2)
  ctx.fillStyle = style.startFill
  ctx.fill()
  ctx.strokeStyle = style.stroke
  ctx.lineWidth = style.startRingWidth
  ctx.stroke()

  // Meta: llena de acento, con aro claro.
  const last = points[points.length - 1]
  ctx.beginPath()
  ctx.arc(last.x, last.y, style.dotRadius, 0, Math.PI * 2)
  ctx.fillStyle = style.stroke
  ctx.fill()
  ctx.strokeStyle = style.endRing
  ctx.lineWidth = style.endRingWidth
  ctx.stroke()
}

export interface ShareCardExport {
  fileName: string
  title: string
  text: string
}

/**
 * Cola de exportación: lienzo → blob → hoja de compartir del sistema.
 * `null` cuando el lienzo no dio blob; entonces no hay nada que medir y quien
 * llama debe salir sin registrar el evento.
 */
export async function exportShareCard(
  canvas: HTMLCanvasElement,
  { fileName, title, text }: ShareCardExport,
): Promise<ShareImageOutcome | null> {
  const blob = await canvasToBlob(canvas)
  if (!blob) return null
  return shareImage(blob, fileName, title, text)
}
