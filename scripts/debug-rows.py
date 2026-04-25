#!/usr/bin/env python3
"""Print per-row 'darkness ratio' for the top N rows of an image."""
import sys
from pathlib import Path
from PIL import Image

THRESHOLDS = (18, 50, 100)

def main(path: str, count: int = 200):
    img = Image.open(path).convert("L")
    w, h = img.size
    px = img.load()
    for y in range(min(count, h)):
        counts = [0] * len(THRESHOLDS)
        for x in range(w):
            v = px[x, y]
            for i, t in enumerate(THRESHOLDS):
                if v < t:
                    counts[i] += 1
        ratios = [c / w for c in counts]
        print(f"y={y:3d}  dark<18={ratios[0]:.3f}  <50={ratios[1]:.3f}  <100={ratios[2]:.3f}")

if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 200)
