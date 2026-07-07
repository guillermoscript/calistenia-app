/**
 * F5 (#174): post-proceso DETERMINISTA del output del LLM para recibos.
 * El prompt pide nombres limpios y name_normalized en minúsculas, pero el
 * modelo no siempre obedece — esto lo GARANTIZA en código:
 * - name en minúsculas y SIN cantidades/unidades/tamaños ("HARINA PAN 1KG" → "harina pan")
 * - name_normalized SIEMPRE recalculado (lowercase, sin acentos) — nunca el del LLM
 *   (mismo algoritmo que normalizePantryName en packages/core; mcp-server no
 *   puede importarlo por estar fuera del workspace pnpm)
 * - qty/unit embebidos en nombre o raw_line rescatados si el LLM los dejó null
 *   (alias de recibo: GR→g, LT→l, UND→unidad, PAQ→paquete…)
 * - items sin nombre utilizable se DESCARTAN → su línea va a ignored_lines
 * - líneas duplicadas del mismo producto se fusionan (suma qty y precio)
 */

type Unit = "g" | "kg" | "ml" | "l" | "unidad" | "paquete";
type Confidence = "high" | "med" | "low";

export interface SanitizableReceiptItem {
  name: string;
  name_normalized: string;
  category: string;
  quantity: number | null;
  unit: Unit | null;
  price_total: number | null;
  expiry_days: number | null;
  confidence: Confidence;
  raw_line: string;
}

const UNIT_ALIASES: Record<string, Unit> = {
  g: "g", gr: "g", grs: "g", gramo: "g", gramos: "g",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg",
  ml: "ml", cc: "ml",
  l: "l", lt: "l", lts: "l", litro: "l", litros: "l",
  un: "unidad", und: "unidad", unid: "unidad", unidad: "unidad", unidades: "unidad",
  paq: "paquete", pqt: "paquete", paquete: "paquete", pack: "paquete",
};

const UNIT_TOKEN = "kgs?|grs?|g|gramos?|kilos?|ml|cc|lts?|l|litros?|und|unid|un|unidad(?:es)?|paq|pqt|pack|paquetes?";
// "1kg", "1.5 LT", "900gr" (número + unidad) y "KG 2.145" (unidad + número, formato balanza)
const QTY_THEN_UNIT = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_TOKEN})\\b\\.?`, "i");
const UNIT_THEN_QTY = new RegExp(`\\b(${UNIT_TOKEN})\\.?\\s*(\\d+(?:[.,]\\d+)?)`, "i");
// multiplicadores "x2" / "X 3" (packs) — se limpian del nombre
const MULT = /\bx\s*\d+\b/gi;

const CONF_RANK: Record<Confidence, number> = { low: 0, med: 1, high: 2 };

export function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Copia local de canonCurrency (packages/core/lib/money.ts — mcp-server está
// fuera del workspace pnpm y no puede importarlo). Mantener en sync.
const CURRENCY_CANON: Record<string, string> = {
  usd: "USD", us$: "USD", $: "USD", dolar: "USD", dolares: "USD", dollar: "USD",
  ves: "VES", bs: "VES", "bs.": "VES", bss: "VES", bsd: "VES", bsf: "VES",
  bolivar: "VES", bolivares: "VES",
  eur: "EUR", "€": "EUR", euro: "EUR", euros: "EUR",
};

/** Código canónico de moneda ("Bs" → "VES"); desconocido → uppercase tal cual. */
export function canonCurrency(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const key = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (key.length === 0) return null;
  return CURRENCY_CANON[key] ?? raw.trim().toUpperCase();
}

function parseNum(s: string): number | null {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Extrae {qty, unit} de un texto tipo "harina pan 1kg" o "POLLO ENT KG 2.145". */
export function extractQtyUnit(text: string): { qty: number; unit: Unit } | null {
  let m = text.match(QTY_THEN_UNIT);
  if (m) {
    const qty = parseNum(m[1]);
    const unit = UNIT_ALIASES[m[2].toLowerCase()];
    if (qty != null && unit) return { qty, unit };
  }
  m = text.match(UNIT_THEN_QTY);
  if (m) {
    const qty = parseNum(m[2]);
    const unit = UNIT_ALIASES[m[1].toLowerCase()];
    if (qty != null && unit) return { qty, unit };
  }
  // multiplicador de pack: "3 X 1.50" (N antes de la x) o "LATA X2" (x antes de N;
  // lookahead anti-decimal para no comerse el precio de "X 1.50")
  m = text.match(/\b(\d+)\s*x\b/i) ?? text.match(/\bx\s*(\d+)(?![.,\d])/i);
  if (m) {
    const qty = parseNum(m[1]);
    if (qty != null) return { qty, unit: "unidad" };
  }
  return null;
}

/** Nombre limpio: sin tokens de cantidad/unidad/multiplicador, minúsculas, espacios colapsados. */
export function cleanItemName(name: string): string {
  const cleaned = name
    .replace(new RegExp(QTY_THEN_UNIT.source, "gi"), " ")
    .replace(new RegExp(UNIT_THEN_QTY.source, "gi"), " ")
    .replace(MULT, " ")
    .replace(/\s{2,}/g, " ")
    .toLowerCase()
    .trim()
    // separadores colgantes tras quitar tokens ("coca cola -" → "coca cola")
    .replace(/[\s\-·.,/]+$/, "")
    .replace(/^[\s\-·.,/]+/, "");
  // si limpiar se comió todo (línea que ERA solo cantidades), conservar el original en minúsculas
  return cleaned.length > 0 ? cleaned : name.toLowerCase().trim();
}

export function sanitizeReceiptItems(
  items: SanitizableReceiptItem[],
  ignoredLines: string[],
): { items: SanitizableReceiptItem[]; ignored_lines: string[] } {
  const ignored = [...ignoredLines];
  const merged = new Map<string, SanitizableReceiptItem>();
  const order: string[] = [];

  for (const raw of items) {
    // datos mínimos: sin nombre no hay item — la línea queda visible en ignoradas
    if (!raw.name || raw.name.trim().length === 0) {
      if (raw.raw_line?.trim()) ignored.push(raw.raw_line.trim());
      continue;
    }

    const name = cleanItemName(raw.name);
    let quantity = raw.quantity;
    let unit = raw.unit;
    // el LLM dejó qty/unit null pero estaban embebidos en el nombre o la línea
    if (quantity == null || unit == null) {
      const ex = extractQtyUnit(raw.name) ?? extractQtyUnit(raw.raw_line ?? "");
      if (ex) {
        if (quantity == null && unit == null) ({ qty: quantity, unit } = ex);
        else if (unit == null && quantity != null && ex.qty === quantity) unit = ex.unit;
        else if (quantity == null && unit != null && ex.unit === unit) quantity = ex.qty;
      }
    }

    const item: SanitizableReceiptItem = {
      ...raw,
      name,
      name_normalized: normalizeName(name),
      quantity,
      unit,
    };

    // merge de duplicados (mismo producto y unidad). Solo si ambos precios se
    // leyeron o ambos faltan: mezclar precio parcial con qty total corrompería
    // el costo unitario ($/kg) que F5 usa para el gasto por comida.
    const key = `${item.name_normalized}|${item.unit ?? ""}`;
    const prev = merged.get(key);
    const canMerge =
      prev != null && ((prev.price_total != null) === (item.price_total != null));
    if (prev && canMerge) {
      prev.quantity = prev.quantity != null && item.quantity != null ? prev.quantity + item.quantity : null;
      prev.price_total = prev.price_total != null && item.price_total != null ? prev.price_total + item.price_total : null;
      prev.confidence = CONF_RANK[item.confidence] < CONF_RANK[prev.confidence] ? item.confidence : prev.confidence;
      prev.raw_line = [prev.raw_line, item.raw_line].filter(Boolean).join(" + ");
    } else if (prev && !canMerge) {
      // misma clave pero precios incompatibles → fila aparte con clave única
      const altKey = `${key}#${order.length}`;
      merged.set(altKey, item);
      order.push(altKey);
    } else {
      merged.set(key, item);
      order.push(key);
    }
  }

  return { items: order.map((k) => merged.get(k)!), ignored_lines: ignored };
}
