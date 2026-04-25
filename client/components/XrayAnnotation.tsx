import * as React from "react";

import { GalleryImage, type GalleryImageProps } from "./Gallery";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// XrayAnnotation — wraps a GalleryImage with absolutely positioned SVG markers
// that point at notable findings (e.g. a bullet, a healed fracture). Clicks
// pass through the SVG (`pointer-events-none`) so the underlying lightbox
// trigger keeps working exactly as it does for any other gallery thumbnail.
// ---------------------------------------------------------------------------

export type XrayMarker = {
  /** Center X as a fraction of the image width, 0..1. */
  cx: number;
  /** Center Y as a fraction of the image height, 0..1. */
  cy: number;
  /** Radius as a fraction of the *shorter* axis-equivalent (we use width). 0..1. */
  r: number;
  /** Short label rendered as a chip near the circle. Optional. */
  label?: string;
};

export type XrayAnnotationProps = Omit<GalleryImageProps, "children"> & {
  markers: XrayMarker[];
  /** ARIA label for the SVG layer (decorative by default). */
  svgAriaLabel?: string;
};

// SVG viewBox is 0..100 in both axes (percent space). Stroke widths and font
// sizes are tuned in those units — they scale with the image automatically.
const VIEWBOX = 100;

// Pick a chip anchor outside the circle. Default = top-right of the marker,
// flipped to the opposite side if the circle is too close to the edge so the
// label never gets clipped. Returned coordinates are in the same 0..100 space.
function chipAnchor(m: XrayMarker): { x: number; y: number; align: "start" | "end" } {
  const cx = m.cx * 100;
  const cy = m.cy * 100;
  const r = m.r * 100;
  // Default: place chip up-and-right of the circle.
  let x = cx + r + 1.2;
  let y = cy - r - 1.2;
  let align: "start" | "end" = "start";
  // Flip horizontally if it would run off the right edge.
  if (x > 78) {
    x = cx - r - 1.2;
    align = "end";
  }
  // Clamp vertically so the chip doesn't escape the top/bottom.
  if (y < 4) y = cy + r + 4;
  if (y > 96) y = 96;
  return { x, y, align };
}

export function XrayAnnotation({
  markers,
  className,
  imgClassName,
  svgAriaLabel,
  ...galleryProps
}: XrayAnnotationProps) {
  // Stable per-instance id namespace for the keyframes — avoids collisions
  // when several XrayAnnotations live on the same page.
  const animId = React.useId().replace(/[^a-z0-9]/gi, "");

  return (
    <div className={cn("relative isolate", className)}>
      <GalleryImage
        {...galleryProps}
        // The image must fully fill the wrapper so the absolutely-positioned
        // SVG (which uses 0..100% coords) lines up with the actual pixels.
        className="block w-full"
        imgClassName={cn("block w-full h-auto", imgClassName)}
      />

      {/* Per-instance pulse keyframes. Skipped under prefers-reduced-motion. */}
      <style>{`
        @keyframes xray-pulse-${animId} {
          0%, 100% { opacity: 0.95; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.08); }
        }
        .xray-marker-${animId} {
          transform-box: fill-box;
          transform-origin: center;
          animation: xray-pulse-${animId} 1.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .xray-marker-${animId} { animation: none; }
        }
      `}</style>

      <svg
        // pointer-events-none → click-through to the underlying button so the
        // lightbox still opens. SVG is purely decorative.
        className="pointer-events-none absolute inset-0 h-full w-full text-primary"
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        preserveAspectRatio="none"
        role="img"
        aria-hidden={svgAriaLabel ? undefined : true}
        aria-label={svgAriaLabel}
      >
        {markers.map((m, i) => {
          const cx = m.cx * 100;
          const cy = m.cy * 100;
          const r = m.r * 100;
          const chip = chipAnchor(m);
          // Approximate chip width from label length so the rect fits the text.
          // Each char ~1.6 units at fontSize 3 in 0..100 viewBox.
          const labelText = m.label ?? "";
          const padX = 1.4;
          const padY = 0.9;
          const charW = 1.55;
          const textW = labelText.length * charW;
          const chipW = textW + padX * 2;
          const chipH = 4.2;
          const rectX = chip.align === "start" ? chip.x : chip.x - chipW;
          const rectY = chip.y - chipH / 2;

          return (
            <g key={i}>
              {/* Animated marker circle. */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="transparent"
                stroke="currentColor"
                strokeWidth={0.6}
                strokeDasharray="2 1.5"
                className={`xray-marker-${animId}`}
                vectorEffect="non-scaling-stroke"
              />
              {/* Static, slightly larger halo for legibility on bright bones. */}
              <circle
                cx={cx}
                cy={cy}
                r={r + 0.4}
                fill="transparent"
                stroke="currentColor"
                strokeWidth={0.25}
                strokeOpacity={0.4}
                vectorEffect="non-scaling-stroke"
              />
              {labelText ? (
                <>
                  {/* Leader line from circle edge to chip edge. */}
                  <line
                    x1={chip.align === "start" ? cx + r * 0.9 : cx - r * 0.9}
                    y1={cy - r * 0.6}
                    x2={chip.align === "start" ? rectX : rectX + chipW}
                    y2={chip.y}
                    stroke="currentColor"
                    strokeWidth={0.35}
                    strokeOpacity={0.85}
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Chip background — primary/90. */}
                  <rect
                    x={rectX}
                    y={rectY}
                    width={chipW}
                    height={chipH}
                    rx={1.2}
                    ry={1.2}
                    fill="currentColor"
                    fillOpacity={0.9}
                  />
                  <text
                    x={rectX + chipW / 2}
                    y={chip.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={2.6}
                    fontWeight={600}
                    className="fill-primary-foreground"
                    style={{
                      fontFamily:
                        "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                    }}
                  >
                    {labelText}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default XrayAnnotation;
