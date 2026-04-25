#!/usr/bin/env python3
"""Compose a static map of Super Vero Zira (Vukov Spomenik area, Belgrade)
from OSM tiles and save as public/images/map.webp.

Run once. The site uses this as a clickable, tinted background image
in the Location card.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import math
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DST = ROOT / "public" / "images" / "map.webp"

# Super Vero Zira at the corner of Roosevelt's / Cvijićeva near Vukov Spomenik.
LAT = 44.8079
LON = 20.4838
ZOOM = 16
TILE_SIZE = 256
# 4 cols x 3 rows = 1024x768 raw; we'll center-crop the marker.
COLS = 4
ROWS = 3

def deg2num(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    lat_rad = math.radians(lat)
    n = 1 << zoom
    xtile = (lon + 180.0) / 360.0 * n
    ytile = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    return xtile, ytile

def fetch_tile(zoom: int, x: int, y: int) -> Image.Image:
    url = f"https://tile.openstreetmap.org/{zoom}/{x}/{y}.png"
    req = urllib.request.Request(url, headers={"User-Agent": "bulka-the-dog/0.1"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return Image.open(r).copy()

def main():
    xf, yf = deg2num(LAT, LON, ZOOM)
    cx_tile = int(xf)
    cy_tile = int(yf)
    # offset of the marker INSIDE its tile, in pixels
    px_in_tile = (xf - cx_tile) * TILE_SIZE
    py_in_tile = (yf - cy_tile) * TILE_SIZE

    # arrange a COLS x ROWS grid centered on (cx_tile, cy_tile)
    x_start = cx_tile - COLS // 2
    y_start = cy_tile - ROWS // 2
    canvas = Image.new("RGB", (COLS * TILE_SIZE, ROWS * TILE_SIZE), (220, 220, 220))
    for col in range(COLS):
        for row in range(ROWS):
            tile_x = x_start + col
            tile_y = y_start + row
            try:
                tile = fetch_tile(ZOOM, tile_x, tile_y)
            except Exception as e:
                print(f"tile fetch failed {tile_x},{tile_y}: {e}")
                continue
            canvas.paste(tile, (col * TILE_SIZE, row * TILE_SIZE))
    # marker pixel position on canvas
    mx = (cx_tile - x_start) * TILE_SIZE + int(px_in_tile)
    my = (cy_tile - y_start) * TILE_SIZE + int(py_in_tile)
    # draw a soft pin
    d = ImageDraw.Draw(canvas, "RGBA")
    d.ellipse([mx - 12, my - 12, mx + 12, my + 12], outline=(255, 255, 255, 255), width=4)
    d.ellipse([mx - 9, my - 9, mx + 9, my + 9], fill=(217, 95, 35, 255))
    # crop to a more cinematic 16:9-ish around marker
    target_w, target_h = 1024, 576
    left = max(0, min(canvas.size[0] - target_w, mx - target_w // 2))
    top = max(0, min(canvas.size[1] - target_h, my - target_h // 2))
    canvas = canvas.crop((left, top, left + target_w, top + target_h))
    DST.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(DST, format="WEBP", quality=85, method=6)
    print(f"saved {DST.relative_to(ROOT)}  size={canvas.size}")

if __name__ == "__main__":
    main()
