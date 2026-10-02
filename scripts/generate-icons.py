"""Generate first-party FrameFetch icons. Build-time only: Python + Pillow 12.3.0."""

from pathlib import Path

import PIL
from PIL import Image, ImageDraw

if PIL.__version__ != "12.3.0":
    raise SystemExit("Reproducible icon generation requires Pillow 12.3.0")

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "resources" / "icons"
OUTPUT.mkdir(parents=True, exist_ok=True)
BLUE = "#336bdf"  # Matches renderer .brand-mark.
BACKGROUND = (96, 96, 928, 928)
FILM = (244, 248, 780, 776)
WINDOWS = [(336, 308, 688, 498), (336, 526, 688, 716)]
PERFORATIONS = [
    (x, y, x + 32, y + 60) for x in [268, 724] for y in [308, 416, 524, 632]
]
SCALE = 4


def scaled(box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    return tuple(value * SCALE for value in box)


canvas = Image.new("RGBA", (1024 * SCALE, 1024 * SCALE), (0, 0, 0, 0))
ImageDraw.Draw(canvas).rounded_rectangle(
    scaled(BACKGROUND), radius=184 * SCALE, fill=BLUE
)
film = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(film)
draw.rounded_rectangle(scaled(FILM), radius=32 * SCALE, fill="white")
for box in WINDOWS:
    draw.rounded_rectangle(scaled(box), radius=12 * SCALE, fill=(0, 0, 0, 0))
for box in PERFORATIONS:
    draw.rounded_rectangle(scaled(box), radius=7 * SCALE, fill=(0, 0, 0, 0))
master = Image.alpha_composite(canvas, film).resize(
    (1024, 1024), Image.Resampling.LANCZOS
)
master.save(OUTPUT / "icon-1024.png", compress_level=9)
master.resize((512, 512), Image.Resampling.LANCZOS).save(
    OUTPUT / "icon-512.png", compress_level=9
)
master.save(OUTPUT / "icon.icns", format="ICNS")
master.save(
    OUTPUT / "icon.ico",
    format="ICO",
    sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)],
)


def rectangle(box: tuple[int, int, int, int], radius: int, color: str) -> str:
    x, y, right, bottom = box
    return f'<rect x="{x}" y="{y}" width="{right - x}" height="{bottom - y}" rx="{radius}" fill="{color}"/>'


cutouts = "\n    ".join(
    [rectangle(box, 12, "black") for box in WINDOWS]
    + [rectangle(box, 7, "black") for box in PERFORATIONS]
)
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title">
  <title id="title">FrameFetch — first-party filmstrip application icon</title>
  <defs>
    <mask id="film" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      {rectangle(FILM, 32, "white")}
      {cutouts}
    </mask>
  </defs>
  {rectangle(BACKGROUND, 184, BLUE)}
  <rect width="1024" height="1024" fill="white" mask="url(#film)"/>
</svg>
"""
(OUTPUT / "icon.svg").write_text(svg, encoding="utf-8", newline="\n")
print("Generated FrameFetch SVG, PNG 512/1024, ICNS and multiresolution ICO")
