"""Convierte la paleta de los fliers de oklch a hex y comprueba contrastes WCAG.

Se calcula en oklch para que los acentos compartan croma y luminosidad (y solo
varie el tono), en vez de elegir hex a ojo. El lima de la app, #C6F42F, tiene un
croma altisimo: de ahi que canse la vista en piezas grandes.

    python3 docs/business/ads/palette.py
"""

import math


def oklch_to_hex(L, C, H):
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)

    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3

    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def gamma(c):
        c = 1.055 * (c ** (1 / 2.4)) - 0.055 if c > 0.0031308 else 12.92 * c
        return max(0, min(255, round(c * 255)))

    return "#%02X%02X%02X" % (gamma(r), gamma(g), gamma(bl))


def relative_luminance(hex_color):
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(a, b):
    la, lb = relative_luminance(a), relative_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


PALETTES = {
    "Grafito (dirección principal)": {
        "fondo":   (0.185, 0.008, 100),
        "carta":   (0.245, 0.009, 100),
        "borde":   (0.320, 0.010, 100),
        "hueso":   (0.945, 0.008,  95),
        "apagado": (0.690, 0.008,  95),
        "acento":  (0.760, 0.098, 118),
    },
    "Papel": {
        "fondo":   (0.965, 0.006,  90),
        "carta":   (0.925, 0.008,  90),
        "borde":   (0.855, 0.010,  90),
        "tinta":   (0.215, 0.012,  90),
        "apagado": (0.480, 0.010,  90),
        "acento":  (0.520, 0.098, 118),
    },
    "Monocromo": {
        "fondo":   (0.185, 0.008, 100),
        "carta":   (0.245, 0.009, 100),
        "borde":   (0.320, 0.010, 100),
        "hueso":   (0.945, 0.008,  95),
        "apagado": (0.690, 0.008,  95),
    },
}

resolved = {}
for name, tokens in PALETTES.items():
    print("\n%s" % name)
    resolved[name] = {}
    for token, (L, C, H) in tokens.items():
        hx = oklch_to_hex(L, C, H)
        resolved[name][token] = hx
        print("  %-8s %s   oklch(%.3f %.3f %d)" % (token, hx, L, C, H))

print("\ncontraste sobre el fondo (AA texto grande = 3.0, AA normal = 4.5)")
for name, tokens in resolved.items():
    bg = tokens["fondo"]
    for token, hx in tokens.items():
        if token in ("fondo", "carta", "borde"):
            continue
        print("  %-28s %-8s %.2f" % (name, token, contrast(bg, hx)))

print("\ncroma comparado")
print("  lima actual #C6F42F  oklch ~0.91 0.21 122   (muy alto: cansa en pieza grande)")
print("  acento nuevo         oklch  0.76 0.098 118  (mismo tono, menos de la mitad de croma)")
