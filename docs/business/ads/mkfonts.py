"""Descarga las variantes latin de las fuentes de marca y las incrusta como data: URI.

Necesario porque la exportacion a PNG del canvas no incrusta Google Fonts: sin esto
los anuncios exportados saldrian con la tipografia de respaldo. Se ejecuta a mano,
el resultado (fonts-embedded.css) se pega en el <helmet> de cada artboard.
"""

import base64
import pathlib
import re
import subprocess
import sys

d = pathlib.Path(__file__).parent
css = (d / "fonts.css").read_text()
blocks = re.findall(r"/\*\s*([a-z0-9-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)

want = {("Bebas Neue", "400"), ("DM Sans", "400"), ("DM Sans", "700"), ("JetBrains Mono", "600")}
out, seen = [], set()

for subset, body in blocks:
    if subset != "latin":
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
    wt_m = re.search(r"font-weight:\s*(\d+)", body)
    wt = wt_m.group(1) if wt_m else "400"
    if (fam, wt) not in want or (fam, wt) in seen:
        continue
    url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
    raw = subprocess.run(["curl", "-s", "-m", "30", url], capture_output=True).stdout
    if not raw:
        print("FAIL", fam, wt, file=sys.stderr)
        sys.exit(1)
    seen.add((fam, wt))
    b64 = base64.b64encode(raw).decode()
    out.append(
        "@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:block;"
        "src:url(data:font/woff2;base64,%s) format('woff2');}" % (fam, wt, b64)
    )
    print("ok", fam, wt, len(raw) // 1024, "KB", file=sys.stderr)

(d / "fonts-embedded.css").write_text("\n".join(out))
print("total", (d / "fonts-embedded.css").stat().st_size // 1024, "KB")
