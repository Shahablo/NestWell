"""Generate the PWA icons: a teal rounded square with a simple nest mark."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
TEAL = (31, 95, 91)
CREAM = (247, 246, 242)
AMBER = (232, 181, 92)


def draw(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = size * 0.22
    d.rounded_rectangle([0, 0, size, size], radius=r, fill=TEAL)
    # nest: three stacked arcs
    cx, cy = size / 2, size * 0.62
    for i, w in enumerate((0.62, 0.50, 0.38)):
        half = size * w / 2
        top = cy - size * 0.10 + i * size * 0.09
        d.arc([cx - half, top, cx + half, top + size * 0.34], start=0, end=180, fill=CREAM, width=max(2, size // 22))
    # egg
    ew, eh = size * 0.20, size * 0.26
    d.ellipse([cx - ew / 2, cy - size * 0.30, cx + ew / 2, cy - size * 0.30 + eh], fill=AMBER)
    return img


for s in (192, 512):
    draw(s).save(OUT / f"icon-{s}.png")

svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#1f5f5b"/>
<path d="M12 36a20 10 0 0 0 40 0" fill="none" stroke="#f7f6f2" stroke-width="3" stroke-linecap="round"/>
<path d="M16 42a16 8 0 0 0 32 0" fill="none" stroke="#f7f6f2" stroke-width="3" stroke-linecap="round"/>
<path d="M20 48a12 6 0 0 0 24 0" fill="none" stroke="#f7f6f2" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="32" cy="27" rx="6.5" ry="8.5" fill="#e8b55c"/>
</svg>
"""
(OUT / "icon.svg").write_text(svg, encoding="utf-8")
print("icons written to", OUT)
