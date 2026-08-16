import { describe, it, expect } from "vitest";
import {
  normalizeName,
  canonCurrency,
  extractQtyUnit,
  cleanItemName,
  sanitizeReceiptItems,
  type SanitizableReceiptItem,
} from "./receipt-sanitizer.js";

// Minimal item factory to avoid repeating the full interface in every case.
function item(overrides: Partial<SanitizableReceiptItem> = {}): SanitizableReceiptItem {
  return {
    name: "coca cola",
    name_normalized: "coca cola",
    category: "bebidas",
    quantity: null,
    unit: null,
    price_total: null,
    expiry_days: null,
    confidence: "high",
    raw_line: "COCA COLA 1.5L $2.00",
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("baja a minúsculas y quita acentos", () => {
    expect(normalizeName("Jamón")).toBe("jamon");
    expect(normalizeName("HARINA PAN")).toBe("harina pan");
  });

  it("recorta espacios en los extremos", () => {
    expect(normalizeName("  Leche  ")).toBe("leche");
  });

  it("no cambia texto ya normalizado", () => {
    expect(normalizeName("coca cola")).toBe("coca cola");
  });
});

describe("canonCurrency", () => {
  it("devuelve null para valores ausentes o vacíos", () => {
    expect(canonCurrency(null)).toBeNull();
    expect(canonCurrency(undefined)).toBeNull();
    expect(canonCurrency("")).toBeNull();
    expect(canonCurrency("   ")).toBeNull();
  });

  it("canoniza símbolos y variantes de USD", () => {
    expect(canonCurrency("USD")).toBe("USD");
    expect(canonCurrency("usd")).toBe("USD");
    expect(canonCurrency("$")).toBe("USD");
    expect(canonCurrency("US$")).toBe("USD");
  });

  it("canoniza símbolos y variantes de EUR", () => {
    expect(canonCurrency("€")).toBe("EUR");
    expect(canonCurrency("eur")).toBe("EUR");
    expect(canonCurrency("Euros")).toBe("EUR");
  });

  it("canoniza variantes de bolívar (VES)", () => {
    expect(canonCurrency("Bs")).toBe("VES");
    expect(canonCurrency("bs.")).toBe("VES");
    expect(canonCurrency("Bolivares")).toBe("VES");
  });

  it("moneda desconocida se sube a mayúsculas tal cual", () => {
    expect(canonCurrency("gbp")).toBe("GBP");
    expect(canonCurrency("XYZ")).toBe("XYZ");
  });
});

describe("extractQtyUnit", () => {
  it("extrae número seguido de unidad ('1kg', '500g')", () => {
    expect(extractQtyUnit("harina pan 1kg")).toEqual({ qty: 1, unit: "kg" });
    expect(extractQtyUnit("leche 500g")).toEqual({ qty: 500, unit: "g" });
  });

  it("acepta coma decimal ('1,5 kg')", () => {
    expect(extractQtyUnit("aceite 1,5 kg")).toEqual({ qty: 1.5, unit: "kg" });
  });

  it("extrae unidad seguida de número, formato balanza ('KG 2.145')", () => {
    expect(extractQtyUnit("POLLO ENT KG 2.145")).toEqual({ qty: 2.145, unit: "kg" });
  });

  it("extrae multiplicador de pack ('x2', '3 X 1.50')", () => {
    expect(extractQtyUnit("lata x2")).toEqual({ qty: 2, unit: "unidad" });
    expect(extractQtyUnit("galleta 3 X 1.50")).toEqual({ qty: 3, unit: "unidad" });
  });

  it("reconoce 'und' pero NO el abreviado 'uds' (no está en UNIT_ALIASES/UNIT_TOKEN)", () => {
    expect(extractQtyUnit("6 und")).toEqual({ qty: 6, unit: "unidad" });
    // Posible gotcha: "uds" es una abreviatura común en recibos en español
    // pero no matchea ninguna alternativa de UNIT_TOKEN (solo und|unid|un|unidad(es)).
    expect(extractQtyUnit("6 uds")).toBeNull();
  });

  it("devuelve null cuando no hay cantidad/unidad reconocible", () => {
    expect(extractQtyUnit("coca cola")).toBeNull();
  });
});

describe("cleanItemName", () => {
  it("quita cantidad+unidad embebidas y baja a minúsculas", () => {
    expect(cleanItemName("HARINA PAN 1KG")).toBe("harina pan");
    expect(cleanItemName("POLLO ENT KG 2.145")).toBe("pollo ent");
  });

  it("quita el multiplicador de pack ('X2')", () => {
    expect(cleanItemName("COCA COLA X2")).toBe("coca cola");
  });

  it("recorta separadores colgantes tras limpiar ('Coca Cola -' → 'coca cola')", () => {
    expect(cleanItemName("Coca Cola -")).toBe("coca cola");
  });

  it("si limpiar se come todo el nombre, conserva el original en minúsculas", () => {
    expect(cleanItemName("1KG")).toBe("1kg");
  });
});

describe("sanitizeReceiptItems", () => {
  it("pasa items válidos recalculando name_normalized siempre desde 'name'", () => {
    const { items, ignored_lines } = sanitizeReceiptItems(
      [item({ name: "COCA COLA 1.5L", quantity: 1.5, unit: "l", price_total: 2 })],
      [],
    );
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("coca cola");
    expect(items[0].name_normalized).toBe("coca cola");
    expect(ignored_lines).toEqual([]);
  });

  it("descarta items sin nombre y vuelca su raw_line a ignored_lines", () => {
    const { items, ignored_lines } = sanitizeReceiptItems(
      [item({ name: "", raw_line: "LINEA RARA $1.00" })],
      ["ya ignorada"],
    );
    expect(items).toHaveLength(0);
    expect(ignored_lines).toEqual(["ya ignorada", "LINEA RARA $1.00"]);
  });

  it("descarta items sin nombre y sin raw_line sin añadir nada a ignored_lines", () => {
    const { items, ignored_lines } = sanitizeReceiptItems(
      [item({ name: "   ", raw_line: "" })],
      [],
    );
    expect(items).toHaveLength(0);
    expect(ignored_lines).toEqual([]);
  });

  it("rescata qty/unit embebidos en el nombre cuando el LLM los dejó null", () => {
    const { items } = sanitizeReceiptItems(
      [item({ name: "Harina Pan 1kg", quantity: null, unit: null })],
      [],
    );
    expect(items[0].quantity).toBe(1);
    expect(items[0].unit).toBe("kg");
    expect(items[0].name).toBe("harina pan");
  });

  it("fusiona duplicados (mismo producto+unidad) sumando qty y precio cuando ambos tienen precio", () => {
    const { items } = sanitizeReceiptItems(
      [
        item({ name: "Coca Cola", quantity: 1, unit: "unidad", price_total: 2, raw_line: "COCA COLA A" }),
        item({ name: "coca cola", quantity: 2, unit: "unidad", price_total: 3, raw_line: "COCA COLA B" }),
      ],
      [],
    );
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
    expect(items[0].price_total).toBe(5);
    expect(items[0].raw_line).toBe("COCA COLA A + COCA COLA B");
  });

  it("al fusionar, se queda con la confianza MÁS BAJA entre las dos filas", () => {
    const { items } = sanitizeReceiptItems(
      [
        item({ name: "Coca Cola", quantity: 1, unit: "unidad", price_total: 2, confidence: "high" }),
        item({ name: "coca cola", quantity: 1, unit: "unidad", price_total: 2, confidence: "low" }),
      ],
      [],
    );
    expect(items[0].confidence).toBe("low");
  });

  it("NO fusiona si solo una fila tiene price_total (evita corromper el costo unitario)", () => {
    const { items } = sanitizeReceiptItems(
      [
        item({ name: "Coca Cola", quantity: 1, unit: "unidad", price_total: 2 }),
        item({ name: "coca cola", quantity: 1, unit: "unidad", price_total: null }),
      ],
      [],
    );
    expect(items).toHaveLength(2);
    expect(items[0].price_total).toBe(2);
    expect(items[1].price_total).toBeNull();
  });

  it("items con distinto nombre normalizado o unidad no se fusionan", () => {
    const { items } = sanitizeReceiptItems(
      [
        item({ name: "Coca Cola", quantity: 1, unit: "unidad", price_total: 2 }),
        item({ name: "Pepsi", quantity: 1, unit: "unidad", price_total: 2 }),
        item({ name: "Coca Cola", quantity: 1, unit: "kg", price_total: 2 }),
      ],
      [],
    );
    expect(items).toHaveLength(3);
  });
});
