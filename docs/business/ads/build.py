"""Inyecta las fuentes incrustadas en cada artboard y deja el resultado en build/.

Los ficheros de src/ llevan el marcador /*FONTS*/ dentro del <helmet> para poder
leerlos y editarlos sin arrastrar 136 KB de base64 en cada uno. Este script hace la
sustitucion antes de sembrar el lienzo.

    python3 docs/business/ads/build.py
"""

import pathlib
import shutil

d = pathlib.Path(__file__).parent
src, out = d / "src", d / "build"
fonts = (d / "fonts-embedded.css").read_text()

out.mkdir(exist_ok=True)
for f in sorted(src.glob("*.dc.html")):
    html = f.read_text()
    if "/*FONTS*/" not in html:
        raise SystemExit("falta el marcador /*FONTS*/ en %s" % f.name)
    (out / f.name).write_text(html.replace("/*FONTS*/", fonts))
    print("ok", f.name, (out / f.name).stat().st_size // 1024, "KB")

shutil.copy(src / "canvas.json", out / "canvas.json")
print("ok canvas.json")
