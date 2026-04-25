#!/usr/bin/env python3
"""Draw a dashed circle directly into the x-ray webp so messenger previews,
search engine crawls and the lightbox without JS all see the highlight.

Only health1 right now (bullet location). No label — the caption text in
translations carries the meaning across languages.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "images" / "_raw" / "health1_original.webp"
DST = ROOT / "public" / "images" / "health1.webp"

# Normalised marker (matches what the SVG overlay used).
CX, CY, R = 0.34, 0.41, 0.045

# Dashed circle params (in pixel space relative to image).
DASH_DEG = 9       # length of one dash arc, in degrees
GAP_DEG = 5        # gap between dashes
WIDTH = 4          # stroke thickness px
COLOUR = (255, 130, 40, 255)  # warm orange tuned to site primary

def draw_dashed_circle(img: Image.Image, cx_px: int, cy_px: int, r_px: int):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    angle = 0.0
    while angle < 360:
        start = angle
        end = angle + DASH_DEG
        bbox = [
            cx_px - r_px,
            cy_px - r_px,
            cx_px + r_px,
            cy_px + r_px,
        ]
        d.arc(bbox, start=start, end=end, fill=COLOUR, width=WIDTH)
        angle += DASH_DEG + GAP_DEG
    # add a thin solid halo for contrast on bright X-ray edges
    d.ellipse(
        [
            cx_px - r_px - 1,
            cy_px - r_px - 1,
            cx_px + r_px + 1,
            cy_px + r_px + 1,
        ],
        outline=(255, 130, 40, 80),
        width=1,
    )
    return Image.alpha_composite(img.convert("RGBA"), overlay)

def main():
    # Use the current health1 (already cropped) as the source of truth.
    src = DST if not SRC.exists() else SRC
    if not src.exists():
        raise SystemExit(f"missing source: {src}")
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    cx_px, cy_px = int(w * CX), int(h * CY)
    r_px = int(min(w, h) * R)
    out = draw_dashed_circle(img, cx_px, cy_px, r_px)
    # Archive original once
    raw_dir = ROOT / "public" / "images" / "_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    archive = raw_dir / "health1_original.webp"
    if not archive.exists():
        Image.open(DST).save(archive, format="WEBP", quality=95, method=6)
    out.convert("RGB").save(DST, format="WEBP", quality=92, method=6)
    print(f"burned circle into {DST.name}: center=({cx_px},{cy_px}) r={r_px}")

if __name__ == "__main__":
    main()
