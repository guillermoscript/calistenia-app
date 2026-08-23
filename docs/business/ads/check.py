"""Comprobaciones baratas sobre los artboards antes de sembrar el lienzo.

Valida el JSON de data-props, la sintaxis del bloque de logica, las referencias de
imagen, la linea de support.js y que canvas.json no solape ni mienta sobre el tamano.

    python3 docs/business/ads/check.py             # juego original
    python3 docs/business/ads/check.py src-fliers  # fliers sociales
"""

import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

d = pathlib.Path(__file__).parent
src = d / (sys.argv[1] if len(sys.argv) > 1 else "src")
problems = []

if not src.is_dir():
    raise SystemExit("no existe %s" % src)

for f in sorted(src.glob("*.dc.html")):
    html = f.read_text()

    m = re.search(r"data-props='([^']*)'", html)
    if not m:
        problems.append("%s: sin data-props" % f.name)
    else:
        raw = m.group(1).replace("&amp;", "&").replace("&#39;", "'")
        try:
            json.loads(raw)
        except Exception as e:
            problems.append("%s: data-props invalido (%s)" % (f.name, e))

    # El bloque de logica es JS normal: un parentesis suelto lo rompe en silencio.
    js = re.search(r"<script data-dc-script[^>]*>(.*?)</script>", html, re.S)
    if not js:
        problems.append("%s: sin bloque data-dc-script" % f.name)
    elif shutil.which("node"):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as tmp:
            tmp.write("class DCLogic {}\n" + js.group(1))
            path = tmp.name
        r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        if r.returncode:
            problems.append("%s: JS con error de sintaxis (%s)"
                            % (f.name, r.stderr.strip().splitlines()[-1]))
        pathlib.Path(path).unlink()

    if '<script src="./support.js"></script>' not in html:
        problems.append("%s: falta la linea support.js" % f.name)
    if "/*FONTS*/" not in html:
        problems.append("%s: falta el marcador /*FONTS*/" % f.name)
    if "class Component extends DCLogic" not in html:
        problems.append("%s: falta la clase Component" % f.name)
    for ref in re.findall(r'src="([^"]+\.(?:png|jpg|jpeg|svg|webp))"', html):
        if ref != "logo.png":
            problems.append("%s: referencia a imagen no sembrada: %s" % (f.name, ref))

cv = json.loads((src / "canvas.json").read_text())
boards = cv["artboards"]
names = {b["file"] for b in boards}
for f in src.glob("*.dc.html"):
    if f.name not in names:
        problems.append("canvas.json: falta %s" % f.name)

for note in cv.get("annotations", []):
    if not 120 <= note["w"] <= 960:
        problems.append("canvas.json: nota %s con ancho %d fuera de 120-960"
                        % (note["id"], note["w"]))

for i, a in enumerate(boards):
    for b in boards[i + 1:]:
        gap_x = max(a["x"] - (b["x"] + b["w"]), b["x"] - (a["x"] + a["w"]))
        gap_y = max(a["y"] - (b["y"] + b["h"]), b["y"] - (a["y"] + a["h"]))
        if gap_x < 80 and gap_y < 120:
            problems.append("canvas.json: %s y %s demasiado cerca (x %d, y %d)"
                            % (a["file"], b["file"], gap_x, gap_y))

# la altura declarada en canvas.json debe casar con el alto real del artboard
for a in boards:
    html = (src / a["file"]).read_text()
    m = re.search(r"width: (\d+)px; height: (\d+)px", html)
    if m and (int(m.group(1)), int(m.group(2))) != (a["w"], a["h"]):
        problems.append("canvas.json: %s declara %dx%d pero el root mide %sx%s"
                        % (a["file"], a["w"], a["h"], m.group(1), m.group(2)))

print("\n".join(problems) if problems else "sin problemas")
sys.exit(1 if problems else 0)
