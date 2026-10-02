"""Build application icons from the checked-in Web brand. Requires Pillow 12.3.0."""

import hashlib
import json
import shutil
from pathlib import Path

import PIL
from PIL import Image, ImageOps

if PIL.__version__ != "12.3.0":
    raise SystemExit("Reproducible icon generation requires Pillow 12.3.0")

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "renderer" / "assets"
OUTPUT = ROOT / "resources" / "icons"
OUTPUT.mkdir(parents=True, exist_ok=True)


def fit(source: Image.Image, size: int) -> Image.Image:
    """Keep the original mark and alpha; only scale and center the source."""
    scaled = ImageOps.contain(source, (size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return canvas


with Image.open(ASSETS / "logo.png") as original:
    if original.format != "PNG" or original.mode != "RGBA":
        raise SystemExit("The canonical logo must be an RGBA PNG")
    source = original.copy()

master = fit(source, 1024)
shutil.copyfile(ASSETS / "logo.svg", OUTPUT / "icon.svg")
# Preserve the canonical PNG bytes when its dimensions already match the export.
if source.size == (1024, 1024):
    shutil.copyfile(ASSETS / "logo.png", OUTPUT / "icon-1024.png")
else:
    master.save(OUTPUT / "icon-1024.png", compress_level=9)
fit(source, 512).save(OUTPUT / "icon-512.png", compress_level=9)
master.save(OUTPUT / "icon.icns", format="ICNS")
master.save(
    OUTPUT / "icon.ico",
    format="ICO",
    sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)],
)


def record(relative: str) -> dict[str, str | int]:
    content = (ROOT / relative).read_bytes()
    return {
        "path": relative,
        "sha256": hashlib.sha256(content).hexdigest(),
        "bytes": len(content),
    }


manifest = {
    "version": 1,
    "authority": "video-server/frontend/public",
    "generator": {
        **record("scripts/generate-icons.py"),
        "pillow": "12.3.0",
        "scaling": "contain-lanczos",
    },
    "sources": [
        {
            **record(f"src/renderer/assets/logo.{extension}"),
            "origin": f"public/logo.{extension}",
        }
        for extension in ("svg", "png")
    ],
    "artifacts": [
        record(f"resources/icons/{name}")
        for name in (
            "icon.svg",
            "icon-512.png",
            "icon-1024.png",
            "icon.icns",
            "icon.ico",
        )
    ],
}
(OUTPUT / "brand-manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
    newline="\n",
)
print("Generated Web-brand SVG, PNG 512/1024, ICNS and multiresolution ICO")
