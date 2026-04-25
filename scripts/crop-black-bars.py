#!/usr/bin/env python3
"""Crop black letterbox bars from top/bottom of images in public/images/.

A row is considered a black bar if at least 99.5% of its pixels are below
the brightness threshold. Counts contiguous bar rows from top and bottom,
then crops them off. Side bars are intentionally not touched (X-ray images
have black backgrounds on the sides that are part of the content).
"""
from pathlib import Path
from PIL import Image
import sys

ROOT = Path(__file__).resolve().parents[1]
IMG_DIR = ROOT / "public" / "images"

BRIGHTNESS_THRESHOLD = 18           # pixel brightness below this counts as "black"
STRICT_BLACK_RATIO = 0.995          # pure-black bar row
LOOSE_BLACK_RATIO = 0.60            # status-bar / phone-UI row: mostly black + sparse text/icons
MIN_BAR_PX = 6                      # ignore tiny edge artifacts
MIN_STRICT_FOR_LOOSE = 8            # only extend through loose rows when there's a real bar
MAX_LOOSE_EXTEND_PX = 220           # safety cap for loose extension (avoid eating photo)

def detect_bar(strict_mask, loose_mask):
    """Strict-bar rows from the edge; then extend through adjacent loose rows
    (e.g. phone status bars that are mostly black with sparse UI elements).
    Loose extension only kicks in if at least one strict row was found.
    """
    n_strict = 0
    for s in strict_mask:
        if s:
            n_strict += 1
        else:
            break
    if n_strict == 0:
        return 0
    if n_strict < MIN_STRICT_FOR_LOOSE:
        # too small a strict bar to confidently extend — likely a thin black margin
        # next to legitimate content (e.g. X-ray text rows)
        return n_strict
    n = n_strict
    for l in loose_mask[n_strict:n_strict + MAX_LOOSE_EXTEND_PX]:
        if l:
            n += 1
        else:
            break
    return n

def crop_one(path: Path) -> tuple[int, int, tuple[int,int], tuple[int,int]]:
    img = Image.open(path).convert("RGB")
    w, h = img.size
    gray = img.convert("L")
    px = gray.load()
    strict_max = int(w * (1 - STRICT_BLACK_RATIO))
    loose_max = int(w * (1 - LOOSE_BLACK_RATIO))
    row_strict = []
    row_loose = []
    for y in range(h):
        non_black = 0
        # we need exact count up to loose_max threshold
        for x in range(w):
            if px[x, y] >= BRIGHTNESS_THRESHOLD:
                non_black += 1
                if non_black > loose_max:
                    break
        row_strict.append(non_black <= strict_max)
        row_loose.append(non_black <= loose_max)
    top = detect_bar(row_strict, row_loose)
    bottom = detect_bar(list(reversed(row_strict)), list(reversed(row_loose)))
    if top < MIN_BAR_PX:
        top = 0
    if bottom < MIN_BAR_PX:
        bottom = 0
    if top == 0 and bottom == 0:
        return 0, 0, (w, h), (w, h)
    cropped = img.crop((0, top, w, h - bottom))
    # save back as webp with same name (overwrite)
    cropped.save(path, format="WEBP", quality=92, method=6)
    return top, bottom, (w, h), cropped.size

def main():
    if not IMG_DIR.exists():
        print(f"missing dir: {IMG_DIR}", file=sys.stderr)
        sys.exit(1)
    paths = sorted(IMG_DIR.glob("*.webp"))
    if not paths:
        print("no .webp files found")
        return
    for p in paths:
        try:
            top, bot, before, after = crop_one(p)
        except Exception as e:
            print(f"FAIL {p.name}: {e}")
            continue
        if top == 0 and bot == 0:
            print(f"skip {p.name}: no bars  ({before[0]}x{before[1]})")
        else:
            print(f"crop {p.name}: top={top} bot={bot}  {before[0]}x{before[1]} -> {after[0]}x{after[1]}")

if __name__ == "__main__":
    main()
