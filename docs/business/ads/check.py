"""Comprobaciones baratas sobre los artboards: JSON de data-props, referencias de
imagen y que el layout de canvas.json no solape ni deje huecos por debajo del minimo.

    python3 docs/business/ads/check.py
"""

import json
import pathlib
import re
import sys

d = pathlib.Path(__file__).parent
src = d / "src"
problems = []

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
    if "<script src=\"./support.js\"></script>" not in html:
        problems.append("%s: falta la linea support.js" % f.name)
    if "/*FONTS*/" not in html:
        problems.append("%s: falta el marcador /*FONTS*/" % f.name)
    for ref in re.findall(r'src="([^"]+\.(?:png|jpg|jpeg|svg|webp))"', html):
        if ref not in ("logo.png",):
            problems.append("%s: referencia a imagen no sembrada: %s" % (f.name, ref))
    if "class Component extends DCLogic" not in html:
        problems.append("%s: falta la clase Component" % f.name)

cv = json.loads((src / "canvas.json").read_text())
boards = cv["artboards"]
names = {b["file"] for b in boards}
for f in src.glob("*.dc.html"):
    if f.name not in names:
        problems.append("canvas.json: falta %s" % f.name)

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
    m = re.search(r'width: (\d+)px; height: (\d+)px', html)
    if m and (int(m.group(1)), int(m.group(2))) != (a["w"], a["h"]):
        problems.append("canvas.json: %s declara %dx%d pero el root mide %sx%s"
                        % (a["file"], a["w"], a["h"], m.group(1), m.group(2)))

print("\n".join(problems) if problems else "sin problemas")
sys.exit(1 if problems else 0)
