"""Inyecta las fuentes incrustadas y el logo en cada artboard y deja el resultado en build/.

Los ficheros de src/ llevan el marcador /*FONTS*/ dentro del <helmet> para poder
leerlos y editarlos sin arrastrar 136 KB de base64 en cada uno. Este script hace la
sustitucion antes de sembrar el lienzo.

    python3 docs/business/ads/build.py             # juego original (src -> build)
    python3 docs/business/ads/build.py src-fliers  # fliers sociales (-> build-fliers)
"""

import pathlib
import shutil
import subprocess
import sys

d = pathlib.Path(__file__).parent
repo = d.parents[2]
name = sys.argv[1] if len(sys.argv) > 1 else "src"
src = d / name
out = d / ("build" + name[3:])
fonts = (d / "fonts-embedded.css").read_text()

if not src.is_dir():
    raise SystemExit("no existe %s" % src)

out.mkdir(exist_ok=True)

# El logo se reduce desde el original de la app (el repo ignora *.png, asi que no
# se guarda una copia aqui). El lienzo rechaza entradas grandes: 420 px basta.
logo_out = out / "logo.png"
shutil.copy(repo / "apps/web/public/logo-bg-less.png", logo_out)
if shutil.which("sips"):
    subprocess.run(["sips", "-Z", "420", str(logo_out), "--out", str(logo_out)],
                   capture_output=True, check=True)
    print("ok logo.png", logo_out.stat().st_size // 1024, "KB")
else:
    print("aviso: sin sips, logo.png va a tamano completo (%d KB); reducelo a mano"
          % (logo_out.stat().st_size // 1024))

for f in sorted(src.glob("*.dc.html")):
    html = f.read_text()
    if "/*FONTS*/" not in html:
        raise SystemExit("falta el marcador /*FONTS*/ en %s" % f.name)
    (out / f.name).write_text(html.replace("/*FONTS*/", fonts))
    print("ok", f.name, (out / f.name).stat().st_size // 1024, "KB")

shutil.copy(src / "canvas.json", out / "canvas.json")
print("ok canvas.json ->", out)
