import * as React from "react";

import { GalleryImage } from "@/components/Gallery";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// PhotoStrip — horizontal polaroid-ish row that auto-drifts left and speeds
// up / reverses based on horizontal mouse position. Each card wraps a
// <GalleryImage>, so click + 2-finger pinch open the global lightbox for free.
// ---------------------------------------------------------------------------

export type PhotoStripItem = {
  src: string;
  alt: string;
  caption?: string;
};

export type PhotoStripProps = {
  images: PhotoStripItem[];
  /** Base auto-drift speed in px/s (always to the left). */
  baseSpeed?: number;
  /** Max additional speed contributed by mouse position, px/s. */
  maxBoost?: number;
  className?: string;
};

// Stable per-card visual jitter — rotation in deg, vertical nudge in px,
// width tweak in px. Keyed by image src so re-renders don't reshuffle.
type Jitter = { rot: number; ty: number; w: number };

function hashString(input: string): number {
  // djb2-ish; deterministic across renders, no need for crypto.
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickJitter(seed: string, indexInList: number): Jitter {
  const h = hashString(`${seed}#${indexInList}`);
  // -3deg .. +3deg
  const rot = ((h % 601) / 100 - 3);
  // -6px .. +6px
  const ty = (((h >> 4) % 13) - 6);
  // -8px .. +8px width drift around base
  const w = (((h >> 8) % 17) - 8);
  return { rot, ty, w };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse || "ontouchstart" in window;
}

export function PhotoStrip({
  images,
  baseSpeed = 16,
  maxBoost = 90,
  className,
}: PhotoStripProps) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  // Offset state lives in refs — we never want a re-render per frame.
  const offsetRef = React.useRef(0); // current translateX (positive = scrolled left)
  const targetOffsetRef = React.useRef(0); // where we lerp toward
  const directionRef = React.useRef(1); // 1 = drifting left (offset++), -1 = right
  const lastTsRef = React.useRef<number | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const trackWidthRef = React.useRef(0); // total scroll-able width of the track
  const viewportWidthRef = React.useRef(0); // visible viewport width
  const engagedRef = React.useRef(false); // mouse over the strip → mouse-driven mode
  const fitsRef = React.useRef(false); // strip fits the viewport entirely → no drift
  const [fits, setFits] = React.useState(false); // mirrors fitsRef for layout class hints

  // Two orthogonal flags:
  //   - touchMode: native scroll is allowed; mouse-driven scrub is off.
  //                Drift still runs (gently, via scrollLeft) when content
  //                doesn't fit, so mobile gets a quiet motion cue.
  //   - reducedMotion: motion is fully suppressed; just a static strip.
  const [touchMode, setTouchMode] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isTouchDevice();
  });
  const [reducedMotion, setReducedMotion] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return prefersReducedMotion();
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqPointer = window.matchMedia("(pointer: coarse)");
    const updateMotion = () => setReducedMotion(mqMotion.matches);
    const updatePointer = () =>
      setTouchMode(mqPointer.matches || "ontouchstart" in window);
    mqMotion.addEventListener?.("change", updateMotion);
    mqPointer.addEventListener?.("change", updatePointer);
    return () => {
      mqMotion.removeEventListener?.("change", updateMotion);
      mqPointer.removeEventListener?.("change", updatePointer);
    };
  }, []);

  // Measure track + viewport widths. We bounce between 0 and (track - viewport)
  // — no looping, no duplicated content. If the track fits the viewport, we
  // skip the drift entirely and let the strip sit centered.
  const measure = React.useCallback(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;
    trackWidthRef.current = track.scrollWidth;
    viewportWidthRef.current = viewport.clientWidth;
    const nowFits = trackWidthRef.current <= viewportWidthRef.current + 1;
    fitsRef.current = nowFits;
    setFits((prev) => (prev === nowFits ? prev : nowFits));
    if (nowFits) {
      offsetRef.current = 0;
      targetOffsetRef.current = 0;
      const t = trackRef.current;
      if (t) t.style.transform = "translate3d(0,0,0)";
    }
  }, []);

  React.useEffect(() => {
    measure();
    if (typeof window === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    if (trackRef.current) ro.observe(trackRef.current);
    if (viewportRef.current) ro.observe(viewportRef.current);
    window.addEventListener("load", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", measure);
    };
  }, [measure, images]);

  // The drift loop. Skipped under reduced motion. On touch devices we drive
  // `scrollLeft` directly (so native swipe works alongside drift); on desktop
  // we transform the inner track.
  React.useEffect(() => {
    if (reducedMotion) return;

    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      const dt = last == null ? 0 : Math.min(0.05, (ts - last) / 1000);

      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);

      if (touchMode) {
        // Touch device: drive native scrollLeft on the viewport, so user swipe
        // and JS drift can coexist without fighting each other. Bumped speed
        // 2.5× over the desktop default so motion is visible on phones (the
        // viewport is narrower, the same px/s feels slower relative to it).
        const v = viewportRef.current;
        if (v && !engagedRef.current && max > 0) {
          const TOUCH_SPEED = baseSpeed * 2.5;
          let next = v.scrollLeft + TOUCH_SPEED * dt * directionRef.current;
          if (next >= max) {
            next = max;
            directionRef.current = -1;
          } else if (next <= 0) {
            next = 0;
            directionRef.current = 1;
          }
          v.scrollLeft = next;
        }
        // Track transform stays at 0 in touch mode.
        const track = trackRef.current;
        if (track) track.style.transform = "translate3d(0,0,0)";
      } else if (fitsRef.current || max <= 0) {
        // Whole strip fits the desktop viewport — pin at 0, no motion.
        offsetRef.current = 0;
        const track = trackRef.current;
        if (track) track.style.transform = "translate3d(0,0,0)";
      } else if (engagedRef.current) {
        // Mouse-driven scrub: lerp current offset toward target offset.
        const tgt = targetOffsetRef.current;
        offsetRef.current += (tgt - offsetRef.current) * Math.min(1, 12 * dt);
        const track = trackRef.current;
        if (track)
          track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      } else {
        // Desktop auto-drift, bouncing between edges via translate.
        offsetRef.current += baseSpeed * dt * directionRef.current;
        if (offsetRef.current >= max) {
          offsetRef.current = max;
          directionRef.current = -1;
        } else if (offsetRef.current <= 0) {
          offsetRef.current = 0;
          directionRef.current = 1;
        }
        const track = trackRef.current;
        if (track)
          track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [touchMode, reducedMotion, baseSpeed]);

  // Mouse-driven scrubbing. The track moves OPPOSITE to the cursor: hover
  // near the right edge → strip slides RIGHT-to-LEFT (offset increases) so
  // photos that were off-screen on the right come closer to the cursor.
  // Net effect: cursor pulls photos toward itself, fewer mouse miles to
  // reach a card.
  const onPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (touchMode || reducedMotion) return;
      if (e.pointerType !== "mouse") return;
      if (fitsRef.current) return;
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(1, rect.width);
      const clamped = Math.max(0, Math.min(1, x));
      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
      targetOffsetRef.current = clamped * max;
      void maxBoost;
    },
    [touchMode, reducedMotion, maxBoost],
  );

  // Hover / focus → mouse-driven mode (no auto-drift). On leave → resume drift.
  const setEngaged = React.useCallback((engaged: boolean) => {
    engagedRef.current = engaged;
    if (!engaged) {
      // Resume drift from current offset; pick the direction that takes the
      // strip toward the nearer wall — feels less jerky than always going left.
      const max = Math.max(0, trackWidthRef.current - viewportWidthRef.current);
      directionRef.current = offsetRef.current > max / 2 ? -1 : 1;
    }
  }, []);

  // Render each image exactly once; the strip bounces between edges instead of looping.
  const items = React.useMemo(
    () => images.map((it, i) => ({ ...it, _k: `${i}-${it.src}` })),
    [images],
  );

  return (
    <div
      ref={viewportRef}
      onPointerMove={onPointerMove}
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      // Touch: while a finger is on the strip, pause auto-drift so we don't
      // fight the user's swipe. Resume after a beat once they're done.
      // touchcancel covers the gesture-aborted edge case (incoming call,
      // system sheet) so engagedRef can't get stuck pinned.
      onTouchStart={() => setEngaged(true)}
      onTouchEnd={() => setTimeout(() => setEngaged(false), 1500)}
      onTouchCancel={() => setEngaged(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setEngaged(false);
        }
      }}
      className={cn(
        "relative w-full select-none",
        // overflow-y visible so shadows + hover-scale don't clip top/bottom.
        // Touch: native horizontal scroll IS the swipe channel; JS drift
        // increments scrollLeft alongside. Use `snap-x snap-proximity` (not
        // mandatory) — proximity only snaps on user-driven scroll-stop,
        // doesn't fight programmatic scrollLeft updates each frame.
        // Desktop: we transform the inner track via JS, viewport just clips.
        touchMode
          ? "overflow-x-auto overflow-y-visible touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [scroll-behavior:auto] [overscroll-behavior-x:contain] snap-x snap-proximity"
          : "overflow-x-hidden overflow-y-visible",
        className,
      )}
    >
      <div
        ref={trackRef}
        className={cn(
          "flex flex-nowrap items-center",
          "pt-8 pb-12",
          fits ? "justify-center" : "justify-start",
        )}
        style={{
          // Desktop drift uses transform; touch uses scrollLeft on viewport
          // → no transform compositing on the track in that mode.
          willChange: touchMode || reducedMotion ? undefined : "transform",
        }}
      >
        {items.map((item, i) => {
          const j = pickJitter(item.src, i);
          // Rotate twice as wide on touch (no drift hides micro-jitters there).
          const baseW = 200; // px, the spec's "slightly varied" base
          const width = baseW + j.w;
          return (
            <div
              key={item._k}
              // Negative margin for the overlapping/stacked feel. `relative` +
              // `hover:z-20` lifts a hovered card above its neighbours so the
              // scaled state doesn't get clipped during animation.
              // `snap-center` makes user finger-swipe land neatly on each card.
              className="relative shrink-0 -mr-3 first:ml-2 last:mr-2 hover:z-20 focus-within:z-20 snap-center"
              style={{
                transform: `rotate(${j.rot}deg) translateY(${j.ty}px)`,
                width: `${width}px`,
              }}
            >
              {/* Polaroid frame. */}
              <div
                className={cn(
                  "bg-white p-2 pb-6 rounded-sm origin-center",
                  "shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
                  "transition-all duration-200 ease-out",
                  "hover:scale-[1.08] hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,0.28)]",
                  "focus-within:scale-[1.08] focus-within:-translate-y-1 focus-within:shadow-[0_18px_40px_rgba(0,0,0,0.28)]",
                )}
              >
                <div className="overflow-hidden bg-neutral-100">
                  <GalleryImage
                    src={item.src}
                    alt={item.alt}
                    caption={item.caption}
                    imgClassName="aspect-square object-cover"
                    // Cards past the first viewport are off-screen → lazy.
                    loading="lazy"
                  />
                </div>
                {item.caption ? (
                  <div className="mt-2 text-center italic font-serif text-[13px] leading-tight text-neutral-700 line-clamp-2">
                    {item.caption}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PhotoStrip;
