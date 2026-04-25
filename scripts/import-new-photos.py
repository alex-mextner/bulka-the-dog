#!/usr/bin/env python3
"""Import Bulka's freshly attached photos from macOS temp dir into public/images/.

- Phone screenshots: copy + run black-bar crop (reuses crop-black-bars.py logic).
- Cardiology PDF screenshot: crop the document area out of the phone UI shell.
"""
from pathlib import Path
from PIL import Image
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/var/folders/1c/d4v7_mrs4b9085f6w7w9p35c0000gn/T")
DST = ROOT / "public" / "images"
DST.mkdir(parents=True, exist_ok=True)

# (source filename, destination basename, kind)
ITEMS = [
    ("IMAGE 2026-04-25 14:27:16.jpg", "cardiology", "doc"),
    ("IMAGE 2026-04-25 14:27:52.jpg", "bulka_face", "phone"),
    ("IMAGE 2026-04-25 14:27:55.jpg", "bulka_friends", "phone"),
    ("IMAGE 2026-04-25 14:27:58.jpg", "bulka_tv", "phone"),
]

# --- black-bar crop (copy of crop-black-bars.py thresholds) ---
BRIGHTNESS_THRESHOLD = 18
STRICT_BLACK_RATIO = 0.995
LOOSE_BLACK_RATIO = 0.60
MIN_BAR_PX = 6
MIN_STRICT_FOR_LOOSE = 8
MAX_LOOSE_EXTEND_PX = 220

def detect_bar(strict_mask, loose_mask):
    n_strict = 0
    for s in strict_mask:
        if s:
            n_strict += 1
        else:
            break
    if n_strict == 0:
        return 0
    if n_strict < MIN_STRICT_FOR_LOOSE:
        return n_strict
    n = n_strict
    for l in loose_mask[n_strict : n_strict + MAX_LOOSE_EXTEND_PX]:
        if l:
            n += 1
        else:
            break
    return n

def crop_phone_bars(img: Image.Image) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size
    gray = img.convert("L")
    px = gray.load()
    strict_max = int(w * (1 - STRICT_BLACK_RATIO))
    loose_max = int(w * (1 - LOOSE_BLACK_RATIO))
    row_strict = []
    row_loose = []
    for y in range(h):
        non_black = 0
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
        return img
    return img.crop((0, top, w, h - bottom))

# --- cardiology document extraction ---
def crop_cardiology(img: Image.Image) -> Image.Image:
    """The cardiology report sits inside a phone screenshot with status bar,
    app toolbar at top, floating purple button at bottom-right. Extract the
    white document rectangle.

    Visually verified bounds for this 576x1280 source:
    - top of doc ≈ y=160 (just below the gray app bar)
    - bottom of doc ≈ y=950 (below 'Dr. Vet med, Filip Božinovski')
    - left/right margins ≈ 30px
    """
    w, h = img.size
    # be defensive — clamp to image bounds
    left = min(30, w)
    right = min(w - 30, w)
    top = min(160, h)
    bottom = min(950, h)
    return img.convert("RGB").crop((left, top, right, bottom))

def main():
    if not SRC.exists():
        print(f"missing source dir: {SRC}", file=sys.stderr)
        sys.exit(1)
    raw_dir = DST.parent / "images" / "_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    for src_name, base, kind in ITEMS:
        src_path = SRC / src_name
        if not src_path.exists():
            print(f"skip (missing): {src_name}")
            continue
        # archive raw
        shutil.copy2(src_path, raw_dir / src_path.name)
        img = Image.open(src_path)
        if kind == "phone":
            out = crop_phone_bars(img)
        elif kind == "doc":
            out = crop_cardiology(img)
        else:
            out = img.convert("RGB")
        out_path = DST / f"{base}.webp"
        out.save(out_path, format="WEBP", quality=92, method=6)
        print(f"  {src_name:38s} -> {out_path.relative_to(ROOT)}  {out.size}")

if __name__ == "__main__":
    main()
